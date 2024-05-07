<h1 align="center">
  <br>
  TimeSearcher+
  <br>
</h1>
<h4 align="center">A tool that summarizes and explores temporal data sets with quantitative values</h4>
You can use it to visualize thousands of time series, and select multiple groups by direct manipulation. In addition, it
works as a reactive widget that can be added to other applications, returning the selected groups in real time.

|                                                     Group Selection                                                      |                                                          Detailed View                                                          |
|:------------------------------------------------------------------------------------------------------------------------:|:-------------------------------------------------------------------------------------------------------------------------------:|
|   <img src="https://raw.githubusercontent.com/ivelascog/TimeSearcherPlus/main/imgs/timeSearcher_groupSelection.gif"/>    |        <img src="https://raw.githubusercontent.com/ivelascog/TimeSearcherPlus/main/imgs/timeSearcher_detailedView.gif"/>        |
|                                                   **Moving Patterns**                                                    |                                                       **Reference Lines**                                                       |
|  <img src="https://raw.githubusercontent.com/ivelascog/TimeSearcherPlus/main/imgs/timeSearcher_multipleSelection.gif"/>  | <img src="https://raw.githubusercontent.com/ivelascog/TimeSearcherPlus/main/imgs/timesearcher_referencesLines.png" width="300"> |
## Try it!

You can test timeSearcher+ right now with your **own CSV data** (less than 200MB), using:
| Obervable Notebook |
| --- |
|TODO GIF and noteBook |

## Examples of functionalities.
- [Basic Example](https://observablehq.com/d/ff2f8dc4992114e2?collection=@ivelascog/timesearcherplus)
- [Moving Patterns, Predefined TimeBoxes, Invert Queries](https://observablehq.com/d/29228e86855505e2?collection=@ivelascog/timesearcherplus)
- [References Curves](https://observablehq.com/d/249a32b214a2684d?collection=@ivelascog/timesearcherplus)
- [Make custom layouts](https://observablehq.com/@ivelascog/timesearcher-make-a-custom-layout?collection=@ivelascog/timesearcherplus)
- [Maintaining the state](https://observablehq.com/d/9f28a6538b332cd3?collection=@ivelascog/timesearcherplus)
- [Aggregation and Selection modes](https://observablehq.com/d/e7e7b8a69f571200?collection=@ivelascog/timesearcherplus)

## Real World Examples. 

## Install

```js
npm install time-searcher-plus
```
Requires [^popper.js@2.11.6](https://github.com/FezVrasta/popper.js/), [^d3@7.8.2](http://d3js.org) and [^htl@0.3.1](https://github.com/observablehq/htl).

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
</head>
<body>
  <!-- target for the main Widget -->
  <div id="target"></div>
  <!-- target fot the detailed Widget -->
  <div id="targetDetailed"></div>

  <!-- Load the libraries -->
  <script src="https://d3js.org/d3.v7.js"></script>
  <script src="https://unpkg.com/@popperjs/core@2"></script>
  <script src="https://unpkg.com/htl@0.3.1/dist/htl.min.js"></script>
  <script src="https://unpkg.com/time_searcher/dist/TimeSearcher.min.js"></script>

  <script >
    // TimeSearcher+ Step 1. Create a TimeSearcher+ passing a series of arguments.
    let target = TimeSearcher({
      target: d3.select("#target").node(), // Target to render the overview Widget
      detailedElement: d3.select("#targetDetailed").node(), // Target to render the detailed Widget (Optional)
      x: "Date", // Atribute to show in the X axis (Note that it also supports functions)
      y:  "Open", // Atribute to show in the Y axis (Note that it also supports functions)
      id: "stock", // / Atribute to group the input data (Note that it also supports functions)
      updateCallback: (data) => {console.log(data)}, // Set a callback that will be called when the user's selection is changed. (Optional)

    })
    

    // load your data, Remember to provide a function that transforms your data attributes to the correct type.
    d3.csv("./Stocks.csv", type).then(data => {
      target.ts.data(data);
    });
```
### Step by step

1. **HTML**. Start with this template
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
</head>
<body>
  <!-- Your overview widget goes here -->
  <div id="target"></div>
  <!-- tYour detailed widget goes here -->
  <div id="targetDetailed"></div>
</body>
</html>
```
2. **Import TimeSearcher+**. Create and import a new JavaScript file below the scripts (d3, Popper and TimeSearcher+)
or right in the html like in the example below.
```html
<script src="https://d3js.org/d3.v7.js"></script>
<script src="https://unpkg.com/@popperjs/core@2"></script>
<script src="https://unpkg.com/htl@0.3.1/dist/htl.min.js"></script>
<script src="https://unpkg.com/time_searcher/dist/TimeSearcher.min.js"></script>
<script type="text/javascript">
  //   YOUR_JS_CODE_HERE
</script>
```
3. **Create a TimeSearcher+ Instance**
```js
   let target = TimeSearcher({
      target: d3.select("#target").node(), // Target to render the overview Widget
      detailedElement: d3.select("#targetDetailed").node(), // Target to render the detailed Widget (Optional)
      x: "Date", // Atribute to show in the X axis (Note that it also supports functions)
      y:  "Open", // Atribute to show in the Y axis (Note that it also supports functions)
      id: "stock", // / Atribute to group the input data (Note that it also supports functions)
      // More configuration parameters
      overviewWidth: 1200, // Set the desired width of the overview Widget
      detailedWidth: 1200 - 20, // Set the desired width of the detailed Widget
      overviewHeight: 600, // Set the desired height of the overview Widget
      detailedHeight: 300, // Set the desired height of the individual detailed graph Widget
      detailedContainerHeight: 400, // Set the desired height of the detailed Widget
      updateCallback: (data) => {console.log(data)}, // Set a callback that will be called when the user's selection is changed.
      statusCallback: (status) => {}, // Set a callback that will be called when changing the internal state of the widget ( assignment of colors, brushes, etc...)
      fmtX: d3.timeFormat("%d/%m/%y"), // Function, how to format x points in the tooltip
      fmtY: d3.format(".2d"), // Function, how to format x points in the tooltip
      yLabel: "",
      xLabel: "",
      filters: [], // Array of filters to use, format [[x1, y1], [x2, y2], ...]
      brushShadow: "drop-shadow( 2px 2px 2px rgba(0, 0, 0, .7))", // How to show a shadow on the selected brush
      maxDetailedRecords: 100, // How many results to show in the detail view
      showGroupMedian: true, // If active show a line with the median of the enabled groups
      binWidth: 1, // Sets the width of the bins used to calculate the group average. Note that this value may vary slightly to achieve a integer number of bins.
   })
```

4. [Optional] **Configure TimeSearcher render**
```js
   // Default Parameters
   target.ts.xPartitions = 10; // Partitions performed on the X-axis for the collision acceleration algorithm.
   target.ts.yPartitions = 10; // Partitions performed on the Y-axis for the collision acceleration algorithm.
   target.ts.defaultAlpha = 0.8; // Default transparency (when no selection is active) of drawn lines
   target.ts.selectedAlpha = 1; // Transparency of selected lines
   target.ts.noSelectedAlpha = 0.4; // Transparency of unselected lines
   target.ts.backgroundColor = "#ffffff";
   target.ts.defaultColor = "#aaa"; // Default color (when no selection is active) of the drawn lines. It only has effect when "groupAttr" is not defined.
   target.ts.selectedColor = "#aaa"; // Color of selected lines. It only has effect when "color" is not defined.
   target.ts.noSelectedColor = "#ddd"; // Color of unselected lines. It only has effect when "color" is not defined.
   target.ts.hasDetailed = true; // Determines whether detail data will be displayed or not. Disabling it saves preprocessing time if detail data is not to be displayed.
   target.ts.margin = { left: 50, top: 30, bottom: 50, right: 20 };
   target.ts.colorScale = d3.scaleOrdinal(d3.schemeCategory10); // The color scale to be used to display the different groups defined by the "color" attribute.
   target.ts.brushesColorScale = d3.scaleOrdinal(d3.schemeCategory10); // The color scale to be used to display the brushes
   target.ts.doubleYlegend = false; // Allows the y-axis legend to be displayed on both sides of the chart.
   target.ts.showGrid = false; // If active, a reference grid is displayed.
   target.ts.showBrushTooltip = true; // Allows to display a tooltip on the brushes containing its coordinates.
   target.ts.autoUpdate = true; // Allows to decide whether changes in brushes are processed while moving, or only at the end of the movement.
   target.ts.brushGruopSize = 15; //Controls the size of the colored rectangles used to select the different brushGroups.
   target.ts.stepX = { days: 10 }; // Defines the step used, both in the spinboxes and with the arrows on the X axis. (See https://date-fns.org/v2.16.1/docs/Duration )
   target.ts.stepY = 1; // // Defines the step used, both in the spinboxes and with the arrows on the Y axis.
```
5. **Set the data**
```js
   target.ts.data(myData);
```
6. **[Optional] Add the references lines
```js
    target.ts.addReferenceCurves(myReferenceCurves)
 ```
The file containing the reference lines will be a json file with the following definition:
```js
[
  {
    "name": "Line1",
    "color": "yellow", // Color in css format
    "opacity": 1, // opacity level of the line
    "data": [[p1x,p1y],[p2x,p2y],...]
  },
  {
    "name": "Line2",
    "color": "red", // Color in css format
    "opacity": 0.5, // opacity level of the line
    "data": [[p1x,p1y],[p2x,p2y],...]
  }
]  
 ```

## Options
This section will show all possible options grouped by categories.
### Elements
 - **target**: pass a html element  where you want to render
 -  **detailsElement**:  pass a html element  where you want to render the details
 -  **coordinatesElement**: pass a html element where you want to render the brush coordinates Input.
 -  **groupsElement**: pass a html element where you want to have the brushes controls.
 -  **showBrushesControls**:If true, the brush control is displayed in the default location. If false you can still use brushesControlsElement to show the control on a different element on your app
 -  **showBrushTooltip**: Allows to display a tooltip on the brushes containing its coordinates.
### Data
 - **x**:  Attribute to show in the X axis (Note that it also supports functions)
 - **y**:  Attribute to show in the Y axis (Note that it also supports functions)
 - **id**: Attribute to group the input data (Note that it also supports functions)
 - **color**: Specifies the attribute to be used to discriminate the groups (Note that it also supports functions).
 - **referenceCurves**:  Specifies a Json object with the information of the reference lines.
 - **fmtX**: Function, how to format x points in the tooltip. Note that it must conform to the data type provided in X.
 - **fmtY**: Function, how to format x points in the tooltip. Note that it must conform to the data type provided in Y.
 - **xLabel**: Label to show in the X axis
 - **yLabel**: Label to show in the Y axis
 - **filters**: Array of predefined TimeGroups and TimeBoxes. [Example](https://observablehq.com/d/29228e86855505e2?collection=@ivelascog/timesearcherplus)
### Color Configuration
 - **defaultAlpha**: Default transparency (when no selection is active) of drawn lines
 - **selectedAlpha**: Transparency of selected lines
 - **noSelectedAlpha**: Transparency of unselected lines
 - **alphaScale**: A scale to adjust the alpha by the number of rendering elements
 - **backgroundColor**: 
 - **defaultColor**: Default color (when no selection is active) of the drawn lines. It only has effect when "color" is not defined.
 - **selectedColor**: Color of selected lines. It only has effect when "color" is not defined.
 - **noSelectedColor**: Color of unselected lines. It only has effect when "color" is not defined.
 - **colorScale**: The color scale to be used to display the different groups defined by the "color" attribute. Typically a [categorical scale of D3](https://observablehq.com/@d3/color-schemes)
 - **brushesColorScale**: The color scale to be used to display the brushes typically a [categorical scale of D3](https://observablehq.com/@d3/color-schemes)
 - **selectedColorTransform**: Function to be applied to the color of the selected group. It only has effect when "color" is defined.
### size Configuration
 - **width**: Set the desired width of the overview Widget
 - **height**: Set the desired height of the overview Widget
 - **detailsContainerHeight**: Set the desired height of the details container Widget
 - **detailsWidth**: Set the desired width of the individual details visualization
 - **detailsHeight**: Set the desired height of the individual details visualization
 - **margin**: Set the desired margin for overview Widget, d3 common format ( ```{ left: 50, top: 30, bottom: 50, right: 20 }```)
 - **detailsMargin**:  Margin options for details view, d3 common format, leave null for using the overview margin
### CallBacks
 - **updateCallback**: (data) => doSomethingWithData
 - **statusCallback**: (status) => doSomethingWithStatus
### Rendering
 - **brushShadow**: Determines how the shadow will be applied to the TimeBoxes belonging to the active TimeGroup.
 - **showGroupMedian**: If active show a line with the median of the enabled groups.
 - **hasDetails**: Determines whether detail data will be displayed or not. Disabling it saves preprocessing time if detail data is not to be displayed.
 - **doubleYlegend**: Allows the y-axis legend to be displayed on both sides of the chart.
 - **showGrid**: If active, a reference grid is displayed.
 - **brushGroupSize**: Controls the size of the colored rectangles used to select the different brushGroups.
### Performance
 - **maxDetailsRecords**: How many results to show in the detail view
 - **maxTimelines**: Set to a value to limit the number of distinct timelines to show
 - **xPartitions**: Partitions performed on the X-axis for the collision acceleration algorithm.
 - **yPartitions**: Partitions performed on the Y-axis for the collision acceleration algorithm.
### Options
 - **medianNumBins**: Number of bins used to compute the group median.
 - **medianLineDash**: Selected group median line dash pattern canvas style
 - **medianLineAlpha**: Selected group median line opacity
 - **medianLineWidth**: Selected group median line width
 - **medianFn**: Function to use when showing the median
 - **medianMinRecordsPerBin**: Min number of records each bin must have to be considered
 - **autoUpdate**: Allows to decide whether changes in brushes are processed while moving, or only at the end of the movement.
 - **_this**: pass the object this in order to be able to maintain the state in case of changes in the input
 - **fixAxis**: When active, the axes will not change when modifying the data.

## License

TimeSearcher+.js is licensed under the MIT license. (http://opensource.org/licenses/MIT)

## Contributors

These research tools are the result of a collaboration between  Universidad Rey Juan Carlos in Madrid (Iván Velasco, Sofía Bayona and Luis Pastor), The Kangaroo Foundation in Colombia (Nathalie Charpak, José Tiberio Hernández), and Norhteastern University in Silicon Valley (John Alexis Guerra) 



