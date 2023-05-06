import * as htl from "htl";
import { log } from "./utils.js";

function BrushTooltipEditable({
  fmtX,
  fmtY,
  target,
  margin = { top: 0, left: 0 },
  callback = () => {},
}) {
  const x0E = htl.html`<input class="x0" contenteditable="true"></input>`;
  const y0E = htl.html`<input class="y0" contenteditable="true"></input>`;
  const x1E = htl.html`<input class="x1" contenteditable="true"></input>`;
  const y1E = htl.html`<input class="y1" contenteditable="true"></input>`;

  // https://stackoverflow.com/questions/3392493/adjust-width-of-input-field-to-its-input
  const adjustInputWidth = (input) => {
    input.addEventListener("input", resizeInput); // bind the "resizeInput" callback on "input" event
    resizeInput.call(input); // immediately call the function

    function resizeInput() {
      this.style.width = this.value.length + "ch";
    }
  };

  const resizeInputs = () => [x0E, y0E, x1E, y1E].map(adjustInputWidth);

  const btnChange0E = htl.html`<button>✅</button>`;
  const btnChange1E = htl.html`<button>✅</button>`;

  const fromE = htl.html`<div style="position: absolute; top:0; left:0;">
    <div style="display:flex; position: absolute; bottom: 0px; right: 0px;">
      ${x0E}<strong> x </strong>${y0E} ${btnChange0E}
    </div>
  </div>`;
  const toE = htl.html`<div style="position: absolute; display:flex;">${x1E}<strong> x </strong>${y1E} ${btnChange1E}</div>`;

  const brushTooltip = htl.html`<div class="__ts_tooltip" style="display: none; z-index:2; position: absolute; top: ${margin.top}px; left: ${margin.left}px;">
    <style>
    div.__ts_tooltip { 
      font-family: sans-serif; font-size: 10pt; 
    }
    div.__ts_tooltip > div > div * { 
      margin-right: 1px;
    }
    div.__ts_tooltip div > button {
      padding: 0px;
      display: none;
    }
    div.__ts_tooltip div:hover > button {
      padding: 0px;
      display: block;
    }
    div.__ts_tooltip input {
      background-color:rgba(255, 255, 255, 0);    
      border: none;
      outline: none;
    }
    div.__ts_tooltip input:focus {
        border: solid #aaa;
    }


    </style>
    <div>${fromE}</div>
    <div>${toE}</div>

  </div>`;

  // x0E.oninput = (evt) => evt.preventDefault();
  // x1E.oninput = (evt) => evt.preventDefault();
  // y0E.oninput = (evt) => evt.preventDefault();
  // y1E.oninput = (evt) => evt.preventDefault();

  brushTooltip.__update = ({ selection, selectionPixels }) => {
    brushTooltip.style.display = "block";
    x0E.value = fmtX(selection[0][0]);
    x1E.value = fmtX(selection[1][0]);
    y0E.value = fmtY(selection[0][1]);
    y1E.value = fmtY(selection[1][1]);

    resizeInputs();

    fromE.style.top = selectionPixels[0][1] + "px";
    fromE.style.left = selectionPixels[0][0] + "px";
    toE.style.top = selectionPixels[1][1] + "px";
    toE.style.left = selectionPixels[1][0] + "px";
  };

  brushTooltip.__hide = () => (brushTooltip.style.display = "none");

  // brushTooltip.oninput = (evt) => evt.preventDefault();

  function triggerUpdate() {
    brushTooltip.value = [
      [x0E.value, y0E.value],
      [x1E.value, y1E.value],
    ];
    log("triggerUpdate", brushTooltip.value);
    brushTooltip.dispatchEvent(new Event("input", { bubbles: true }));

    callback(brushTooltip.value);
  }

  btnChange0E.addEventListener("click", triggerUpdate);
  btnChange1E.addEventListener("click", triggerUpdate);

  target.appendChild(brushTooltip);

  //triggerUpdate();
  resizeInputs();

  return brushTooltip;
}

export default BrushTooltipEditable;
