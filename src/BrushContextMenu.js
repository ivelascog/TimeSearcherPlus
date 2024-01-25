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

  let contextMenu = htl.html
  `<div class="__ts_contextMenu" style="display: none; z-index: 2; position: absolute" >
      <ul>
        <li>Mode</li>
        ${intersectE}
        <label for="__ts_c_intersect">Intersect</label>
        ${containsE}
        <label for="__ts_c_contains">Contains</label>
        <li>Aggregation</li>
        ${andE}
        <label for="__ts_c_and">And</label>
        ${orE}
        <label for="__ts_c_or">Or</label>
      </ul>

      <style> 
        .__ts_contextMenu { 
            position: absolute; 
            text-align: center; 
            background: lightgray; 
            border: 1px solid black; 
        } 
      
        .__ts_contextMenu ul { 
            padding: 0px; 
            margin: 0px; 
            min-width: 150px; 
            list-style: none; 
        } 
      
        .__ts_contextMenu ul li { 
            padding-bottom: 7px; 
            padding-top: 7px; 
            border: 1px solid black; 
        } 
      
      
        .__ts_contextMenu ul li:hover { 
            background: darkgray; 
        } 
      </style> 
      </div>`;

  target.appendChild(contextMenu);

  contextMenu.onmouseleave = () => contextMenu.__hide();

  function onChange() {
    let brushMode = intersectE.checked ? BrushModes.Intersect : BrushModes.Contains;
    let brushAggregation = andE.checked ? BrushAggregation.And : BrushAggregation.Or;
    callback(brushMode, brushAggregation, _brush);
  }


  contextMenu.__hide = () => contextMenu.style.display = "none";
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
        log("🚫 ERROR The method elected to compute the selection are not support");
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

    contextMenu.style.display = "block";
    contextMenu.style.left = pxX + "px";
    contextMenu.style.top = pxY + "px";
  };


  return contextMenu;
}


export default BrushContextMenu;
