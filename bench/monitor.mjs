// Chrome's Window Management API reports desktop coordinates in CSS pixels,
// including negative origins and each display's available working area.
const sessions = new WeakMap();
const permissionSessions = new WeakMap();

function monitorSession(page) {
    // Detaching a CDP session clears its emulation settings. Keep it attached
    // through measurement; Playwright disposes it when the page/context closes.
    if (!sessions.has(page))
        sessions.set(page, page.context().newCDPSession(page));
    return sessions.get(page);
}

export async function grantWindowManagement(page, url = page.url()) {
    const origin = new URL(url).origin;
    if (origin === "null")
        throw new Error(
            "Monitor discovery requires a page served from localhost or HTTPS"
        );
    const session = await monitorSession(page);
    const {targetInfo} = await session.send("Target.getTargetInfo");
    const browser = page.context().browser();
    // Permission overrides belong to a browser CDP session. Retain it across
    // navigation and all measured pages until the fresh benchmark browser closes.
    if (!permissionSessions.has(browser)) {
        permissionSessions.set(browser, browser.newBrowserCDPSession());
    }
    const permissions = await permissionSessions.get(browser);
    await permissions.send("Browser.setPermission", {
        permission: {name: "window-management"},
        setting: "granted",
        origin,
        embeddedOrigin: origin,
        browserContextId: targetInfo.browserContextId,
    });
}

async function allowWindowManagement(page) {
    await grantWindowManagement(page);
    await applyViewport(page);
}

async function applyViewport(page) {
    const session = await monitorSession(page);
    // Playwright otherwise emulates the primary screen as 1200x800. Keep the
    // benchmark viewport/DPR fixed, but let Chrome report real desktop screens.
    const viewport = page.viewportSize();
    if (viewport) {
        await session.send("Emulation.setDeviceMetricsOverride", {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 1,
            mobile: false,
            dontSetVisibleSize: true,
        });
    }
}

export async function listMonitors(page) {
    await allowWindowManagement(page);
    const monitors = await page.evaluate(async () => {
        if (!window.getScreenDetails)
            throw new Error(
                "This Chrome version does not support monitor discovery; update Chrome/Chromium"
            );
        const details = await window.getScreenDetails();
        return details.screens.map((screen) => ({
            name: screen.label || `Screen at ${screen.left},${screen.top}`,
            primary: screen.isPrimary,
            left: screen.availLeft,
            top: screen.availTop,
            width: screen.availWidth,
            height: screen.availHeight,
        }));
    });
    // Stable order, independent of Chrome's enumeration order or duplicate labels.
    return monitors.sort(
        (a, b) =>
            Number(b.primary) - Number(a.primary) || a.left - b.left || a.top - b.top
    );
}

export function selectMonitor(monitors, value) {
    if (!/^[1-9]\d*$/.test(value) || Number(value) > monitors.length) {
        throw new Error(
            `Invalid monitor '${value}'. Use --monitor list to see available monitors.`
        );
    }
    return monitors[Number(value) - 1];
}

export async function inspectWindow(page) {
    await allowWindowManagement(page);
    const session = await monitorSession(page);
    await session.send("Emulation.clearDeviceMetricsOverride");
    // Read the actual window and current screen, independently of the requested
    // CDP bounds. Some window managers accept the command but ignore the move.
    try {
        return await page.evaluate(async () => {
            const {currentScreen: screen} = await window.getScreenDetails();
            const left = window.screenX;
            const top = window.screenY;
            const right = left + window.outerWidth;
            const bottom = top + window.outerHeight;
            return {
                name: screen.label || `Screen at ${screen.left},${screen.top}`,
                screenLeft: screen.availLeft,
                screenTop: screen.availTop,
                visibleWidth: window.innerWidth,
                visibleHeight: window.innerHeight,
                inside:
                    left >= screen.availLeft &&
                    top >= screen.availTop &&
                    right <= screen.availLeft + screen.availWidth &&
                    bottom <= screen.availTop + screen.availHeight,
                left,
                top,
                right,
                bottom,
            };
        });
    } finally {
        await applyViewport(page);
    }
}

export async function positionWindow(page, monitor) {
    const monitors = await listMonitors(page);
    if (
        !monitors.some(
            (m) =>
                m.left === monitor.left &&
                m.top === monitor.top &&
                m.width === monitor.width &&
                m.height === monitor.height &&
                m.name === monitor.name
        )
    ) {
        throw new Error(
            `Monitor ${monitor.name} is no longer available or its layout changed; rerun --monitor list`
        );
    }
    const session = await monitorSession(page);
    const {windowId} = await session.send("Browser.getWindowForTarget");
    await session.send("Browser.setWindowBounds", {
        windowId,
        bounds: {windowState: "normal"},
    });
    await session.send("Browser.setWindowBounds", {
        windowId,
        bounds: {
            left: monitor.left + 16,
            top: monitor.top + 16,
            width: Math.min(1300, monitor.width - 32),
            height: Math.min(950, monitor.height - 32),
        },
    });
    await page.bringToFront();
    const viewport = page.viewportSize();
    if (viewport) {
        // setWindowBounds uses window pixels, whereas setContentsSize uses DIP.
        // Size the real client area after moving, when the destination DPI applies.
        await session.send("Browser.setContentsSize", {
            windowId,
            // Leave a small margin for native frame/scrollbar rounding at mixed DPI.
            width: viewport.width + 16,
            height: viewport.height + 16,
        });
    }
    const deadline = Date.now() + 5000;
    do {
        const actual = await inspectWindow(page);
        if (
            actual.screenLeft === monitor.left &&
            actual.screenTop === monitor.top &&
            actual.inside &&
            (!viewport ||
                (actual.visibleWidth >= viewport.width &&
                    actual.visibleHeight >= viewport.height))
        )
            return actual;
        await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    throw new Error(
        `Chrome could not fit the complete benchmark viewport inside ${monitor.name}. Check the monitor's available size and scaling. The desktop/window manager may also block window positioning (e.g. Wayland); try an X11 session.`
    );
}
