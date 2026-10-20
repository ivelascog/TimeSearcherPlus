import { add } from "date-fns";
import {
  expandDateDomainToSnap,
  isValidDateSnapDuration,
  snapDateCoordinate,
} from "./snap/DateSnap.js";
import {
  expandNumericDomainToSnap,
  isValidNumericSnapInterval,
  snapNumericCoordinate,
} from "./snap/NumericSnap.js";

function isDateSnap(interval, domain) {
  return (
    typeof interval === "object" &&
    domain &&
    domain[0] instanceof Date &&
    domain[1] instanceof Date
  );
}

export function isValidSnapInterval(interval, domain) {
  return isDateSnap(interval, domain)
    ? isValidDateSnapDuration(interval, domain)
    : isValidNumericSnapInterval(interval);
}

export function snapCoordinate(value, interval, domain) {
  return isDateSnap(interval, domain)
    ? snapDateCoordinate(value, interval, domain)
    : snapNumericCoordinate(value, interval, domain);
}

export function expandDomainToSnap(domain, interval) {
  return isDateSnap(interval, domain)
    ? expandDateDomainToSnap(domain, interval)
    : expandNumericDomainToSnap(domain, interval);
}

export function stepAtLeastSnap(step, snap, domain) {
  if (!isValidSnapInterval(snap, domain)) return step;
  if (domain[0] instanceof Date) {
    const origin = domain[0];
    const stepEnd = typeof step === "number" ? +origin + step : +add(origin, step);
    const snapEnd = typeof snap === "number" ? +origin + snap : +add(origin, snap);
    return snapEnd > stepEnd ? snap : step;
  }
  return snap > step ? snap : step;
}
