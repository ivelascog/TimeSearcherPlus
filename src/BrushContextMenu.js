import * as htl from "htl";
import { BrushAggregation, BrushModes, log } from "./utils.js";

function BrushContextMenu({ target, callback }) {
  const intersectE = htl.html`<input type="radio" name="mode" id="__ts_c_intersect" value="intersect">`;
  const containsE = htl.html`<input type="radio" name="mode" id="__ts_c_contains" value="contains">`;
  const andE = htl.html`<input type="radio" name="aggregation" id="__ts_c_and" value="and">`;
  const orE = htl.html`<input type="radio" name="aggregation" id="__ts_c_or" value="or">`;

  intersectE.onchange = onChange;
  containsE.onchange = onChange;
  andE.onchange = onChange;
  orE.onchange = onChange;

  let _brush;

  let contextMenu = htl.html`<div class="__ts_contextMenu" style="display: none; z-index: 2; position: absolute" >
      
      
        <div class="__ts_option_label"><strong>Mode</strong></div>
        <div class="__ts_option_values">
          <div>
            ${intersectE}
            <label for="__ts_c_intersect">Intersect</label>
          </div>
          <div>
            ${containsE}
            <label for="__ts_c_contains">Contains</label>
          </div>
        </div>
      

      
        <div class="__ts_option_label"><strong>Aggregation</strong></div>
        <div class="__ts_option_values">
          <div>
            ${andE}
            <label for="__ts_c_and">And</label>
          </div>
          <div>
            ${orE}
            <label for="__ts_c_or">Or</label>
          </div>
        </div>
      
      

      <style> 
        .__ts_contextMenu { 
            border-radius: 3px;
            padding: 4px;
            position: absolute; 
            width: max-content;
            background: #f6f6f6;
            opacity: 0.9;
            border: 1px solid #ccc; 
            font-family: sans-serif;
            font-size: 0.8rem;
            grid-template-columns: 1fr auto;
            grid-row-gap: 7px;
            box-shadow: 2px 2px 1px 0px #888888;
        }         

        .__ts_contextMenu  .__ts_option_values:hover { 
            background: #eee; 
        } 

        .__ts_contextMenu input[type="radio"] {
          margin-top: -1px;
          vertical-align: middle;
        }
      </style> 
    </div>`;

  target.appendChild(contextMenu);

  contextMenu.onmouseleave = () => contextMenu.__hide();

  function onChange() {
    let brushMode = intersectE.checked
      ? BrushModes.Intersect
      : BrushModes.Contains;
    let brushAggregation = andE.checked
      ? BrushAggregation.And
      : BrushAggregation.Or;
    callback(brushMode, brushAggregation, _brush);
  }

  contextMenu.__hide = () => (contextMenu.style.display = "none");
  contextMenu.__show = (mode, aggregation, pxX, pxY, brush) => {
    _brush = brush;
    switch (mode) {
      case BrushModes.Intersect:
        intersectE.checked = true;
        break;
      case BrushModes.Contains:
        containsE.checked = true;
        break;
      default:
        intersectE.checked = true;
        log(
          "🚫 ERROR The method elected to compute the selection are not support"
        );
    }

    switch (aggregation) {
      case BrushAggregation.And:
        andE.checked = true;
        break;
      case BrushAggregation.Or:
        orE.checked = true;
        break;
      default:
        andE.checked = true;
        log("🚫 ERROR The aggregation method elected are not support");
    }

    contextMenu.style.display = "grid";
    contextMenu.style.left = pxX + "px";
    contextMenu.style.top = pxY + "px";
  };

  return contextMenu;
}

export default BrushContextMenu;
