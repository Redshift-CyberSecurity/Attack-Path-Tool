document.onload = (function(d3, saveAs, Blob, undefined){
  "use strict";

  // TODO add user settings
  var consts = {
    defaultTitle: "New Node!"
  };
  var settings = {
    appendElSpec: "#graph"
  };
  
  // define diagonal/curved lines: https://stackoverflow.com/questions/15007877/how-to-use-the-d3-diagonal-function-to-draw-curved-lines
  var diagonal = d3.svg.diagonal()
    .source(function (d) {
      return {"x": d.source.y, "y": d.source.x};
    })
    .target(function (d) {
      return {"x": d.target.y, "y": d.target.x};
    })
    .projection(function (d) {
      return [d.y, d.x];
    });
    
  // define graphcreator object
  var GraphCreator = function(svg, nodes, edges){
    var thisGraph = this;
        thisGraph.idct = 0;

    thisGraph.nodes = nodes || [];
    thisGraph.edges = edges || [];

    thisGraph.state = {
      selectedNode: null,
      selectedEdge: null,
      mouseDownNode: null,
      mouseDownLink: null,
      justDragged: false,
      justScaleTransGraph: false,
      lastKeyDown: -1,
      shiftNodeDrag: false,
      selectedText: null,
      gridActive: false
    };

    thisGraph.svg = svg;
    thisGraph.svgG = svg.append("g")
             .classed(thisGraph.consts.graphClass, true);
    var svgG = thisGraph.svgG;

    // displayed when dragging between nodes
    thisGraph.dragLine = svgG.append('svg:path').attr('class', 'link');

    // svg nodes and edges
    thisGraph.paths = svgG.append("g").selectAll("g");
    thisGraph.circles = svgG.append("g").selectAll("g");

    thisGraph.drag = d3.behavior.drag()
      .origin(function(d){
        return {x: d.x, y: d.y};
          })
          .on("drag", function(args){
            thisGraph.state.justDragged = true;
            thisGraph.dragmove.call(thisGraph, args);
          })
          .on("dragend", function() {
            // todo check if edge-mode is selected
          });

    // listen for key events
    d3.select(window).on("keydown", function(){
      thisGraph.svgKeyDown.call(thisGraph);
    })
    .on("keyup", function(){
      thisGraph.svgKeyUp.call(thisGraph);
    });
    
    svg.on("mousedown", function(d){thisGraph.svgMouseDown.call(thisGraph, d);});
    svg.on("mouseup", function(d){thisGraph.svgMouseUp.call(thisGraph, d);});

    // listen for dragging
    var dragSvg = d3.behavior.zoom()
           .on("zoom", function(){
            if (d3.event.sourceEvent.shiftKey){
              // TODO  the internal d3 state is still changing
              return false;
            } else {
              thisGraph.zoomed.call(thisGraph);
            }
            return true;
          })
          .on("zoomstart", function(){
            var ael = d3.select("#" + thisGraph.consts.activeEditId).node();
            if (ael){
              ael.blur();
            }
            if (!d3.event.sourceEvent.shiftKey) d3.select('body').style("cursor", "move");
          })
          .on("zoomend", function(){
            d3.select('body').style("cursor", "auto");
          });

    svg.call(dragSvg).on("dblclick.zoom", null);

    // listen for resize
    window.onresize = function(){thisGraph.updateWindow(svg);};

    // handle download data
    d3.select("#download-input").on("click", function(){
      var saveEdges = [];
      thisGraph.edges.forEach(function(val, i){
        saveEdges.push({source: val.source.id, target: val.target.id, marked: val.marked});
      });
      var blob = new Blob([window.JSON.stringify({"nodes": thisGraph.nodes, "edges": saveEdges})], {type: "text/plain;charset=utf-8"});
      saveAs(blob, "mydag.json");
    });

    // handle uploaded data
    d3.select("#upload-input").on("click", function(){
      document.getElementById("hidden-file-upload").click();
    });
    d3.select("#hidden-file-upload").on("change", function(){
      if (window.File && window.FileReader && window.FileList && window.Blob) {
        var uploadFile = this.files[0];
        var filereader = new window.FileReader();

        filereader.onload = function(){
          var txtRes = filereader.result;
          // TODO better error handling
          try{
            var jsonObj = JSON.parse(txtRes);
            thisGraph.deleteGraph(true);
            thisGraph.nodes = jsonObj.nodes;
            thisGraph.setIdCt(jsonObj.nodes.length + 1);
            var newEdges = jsonObj.edges;
            newEdges.forEach(function(e, i){
              newEdges[i] = {source: thisGraph.nodes.filter(function(n){return n.id == e.source;})[0],
                             target: thisGraph.nodes.filter(function(n){return n.id == e.target;})[0],
                             marked: e.marked};
            });
            thisGraph.edges = newEdges;
            thisGraph.updateGraph();
                              
            // update marked edges {Move to Front}
            d3.selectAll(".marked").moveToFront();
            
          }catch(err){
            window.alert("Error parsing uploaded file\nError message: " + err.message);
            return;
          }
        };
        filereader.readAsText(uploadFile);
      } else {
        alert("Error saving graph, could be your browser");
      }
    });

    // handle delete graph
    d3.select("#delete-graph").on("click", function(){
      thisGraph.deleteGraph(false);
    });
    
    // handle save png
    d3.select("#save-png").on("click", function(){
      if (thisGraph.state.gridActive == true){
        thisGraph.state.gridActive = false;
        svg.selectAll('.vertical').remove();
        svg.selectAll('.horizontal').remove();
      }
      printPNG(document.getElementById("mainSVG"),"attackpath.png");
    });
    
    // handle save svg
    d3.select("#save-svg").on("click", function(){
      if (thisGraph.state.gridActive == true){
        thisGraph.state.gridActive = false;
        svg.selectAll('.vertical').remove();
        svg.selectAll('.horizontal').remove();
      }
      printSVG(document.getElementById("mainSVG"),"attackpath.svg");
    });
  };

  //https://gist.github.com/eesur/4e0a69d57d3bfc8a82c2
  d3.selection.prototype.moveToFront = function() {  
    return this.each(function(){
      this.parentNode.appendChild(this);
    });
  };
  d3.selection.prototype.moveToBack = function() {  
    return this.each(function() { 
      var firstChild = this.parentNode.firstChild; 
      if (firstChild) { 
        this.parentNode.insertBefore(this, firstChild); 
      } 
    });
  };

  GraphCreator.prototype.setIdCt = function(idct){
    this.idct = idct;
  };

  GraphCreator.prototype.consts =  {
    selectedClass: "selected",
    connectClass: "connect-node",
    circleGClass: "conceptG",
    graphClass: "graph",
    markedClass: "marked",
    activeEditId: "active-editing",
    BACKSPACE_KEY: 8,
    DELETE_KEY: 46,
    ENTER_KEY: 13,
    UP_KEY: 38,
    DOWN_KEY: 40,
    LEFT_KEY: 37,
    RIGHT_KEY: 39,
    M_KEY: 77,
    F_KEY: 70,
    G_KEY: 71,
    nodeRadius: 22,
    gridSize: 25
  };
  
  GraphCreator.prototype.round = function(p, n) {
    return p % n < n / 2 ? p - (p % n) : p + n - (p % n);
  };

  /* PROTOTYPE FUNCTIONS */
  
  GraphCreator.prototype.anchor = function(dir)  {
    switch (dir.anchor) {
            case "top":
            case "bottom":
                return "middle";
            case "left":
                return "end";
            case "right":
            default:
                return "start";
    };
  }

  GraphCreator.prototype.dragmove = function(d) {
    var thisGraph = this;
    if (thisGraph.state.shiftNodeDrag){
      thisGraph.dragLine.attr('d', 'M' + d.x + ',' + d.y + 'L' + d3.mouse(thisGraph.svgG.node())[0] + ',' + d3.mouse(this.svgG.node())[1]);
    } else {
      if (thisGraph.state.gridActive) {
         d.x = thisGraph.round(Math.max(thisGraph.consts.nodeRadius, Math.min(width - thisGraph.consts.nodeRadius, d3.event.x)), thisGraph.consts.gridSize),
         d.y = thisGraph.round(Math.max(thisGraph.consts.nodeRadius, Math.min(height - thisGraph.consts.nodeRadius, d3.event.y)), thisGraph.consts.gridSize);
      } else {
        d.x += d3.event.dx;
        d.y +=  d3.event.dy;
      }
      thisGraph.updateGraph();
    }
  };

  GraphCreator.prototype.deleteGraph = function(skipPrompt){
    var thisGraph = this,
        doDelete = true;
    if (!skipPrompt){
      doDelete = window.confirm("Press OK to delete this graph");
    }
    if(doDelete){
      thisGraph.nodes = [];
      thisGraph.edges = [];
      thisGraph.updateGraph();
    }
  };

  // remove edges associated with a node
  GraphCreator.prototype.spliceLinksForNode = function(node) {
    var thisGraph = this,
        toSplice = thisGraph.edges.filter(function(l) {
      return (l.source === node || l.target === node);
    });
    toSplice.map(function(l) {
      thisGraph.edges.splice(thisGraph.edges.indexOf(l), 1);
    });
  };

  GraphCreator.prototype.replaceSelectEdge = function(d3Path, edgeData){
    var thisGraph = this;
    d3Path.classed(thisGraph.consts.selectedClass, true);
    if (thisGraph.state.selectedEdge){
      thisGraph.removeSelectFromEdge();
    }
    thisGraph.state.selectedEdge = edgeData;
  };

  GraphCreator.prototype.replaceSelectNode = function(d3Node, nodeData){
    var thisGraph = this;
    d3Node.classed(this.consts.selectedClass, true);
    if (thisGraph.state.selectedNode){
      thisGraph.removeSelectFromNode();
    }
    thisGraph.state.selectedNode = nodeData;
  };

  GraphCreator.prototype.removeSelectFromNode = function(){
    var thisGraph = this;
    thisGraph.circles.filter(function(cd){
      return cd.id === thisGraph.state.selectedNode.id;
    }).classed(thisGraph.consts.selectedClass, false);
    thisGraph.state.selectedNode = null;
  };

  GraphCreator.prototype.removeSelectFromEdge = function(){
    var thisGraph = this;
    thisGraph.paths.filter(function(cd){
      return cd === thisGraph.state.selectedEdge;
    }).classed(thisGraph.consts.selectedClass, false);
    thisGraph.state.selectedEdge = null;
  };

  GraphCreator.prototype.pathMouseDown = function(d3path, d){
    var thisGraph = this,
        state = thisGraph.state;
    d3.event.stopPropagation();
    state.mouseDownLink = d;

    if (state.selectedNode){
      thisGraph.removeSelectFromNode();
    }

    var prevEdge = state.selectedEdge;
    if (!prevEdge || prevEdge !== d){
      thisGraph.replaceSelectEdge(d3path, d);
    } else{
      thisGraph.removeSelectFromEdge();
    }
  };
  
  // mousedown on node
  GraphCreator.prototype.circleMouseDown = function(d3node, d){
    var thisGraph = this,
        state = thisGraph.state;
    d3.event.stopPropagation();
    state.mouseDownNode = d;
    if (d3.event.shiftKey){
      state.shiftNodeDrag = d3.event.shiftKey;
      // reposition dragged directed edge
      thisGraph.dragLine.classed('hidden', false)
        .attr('d', 'M' + d.x + ',' + d.y + 'L' + d.x + ',' + d.y);
      return;
    }
  };

  // mouseup on nodes
  GraphCreator.prototype.circleMouseUp = function(d3node, d){
    var thisGraph = this,
        state = thisGraph.state,
        consts = thisGraph.consts;
    // reset the states
    state.shiftNodeDrag = false;
    d3node.classed(consts.connectClass, false);

    var mouseDownNode = state.mouseDownNode;

    if (!mouseDownNode) return;

    thisGraph.dragLine.classed("hidden", true);

    if (mouseDownNode !== d){
      // we're in a different node: create new edge for mousedown edge and add to graph
      var newEdge = {source: mouseDownNode, target: d, marked: false};
      var filtRes = thisGraph.paths.filter(function(d){
        if (d.source === newEdge.target && d.target === newEdge.source){
          thisGraph.edges.splice(thisGraph.edges.indexOf(d), 1);
        }
        return d.source === newEdge.source && d.target === newEdge.target;
      });
      if (!filtRes[0].length){
        thisGraph.edges.push(newEdge);
        thisGraph.updateGraph();
      }
    } else {
      // we're in the same node
      if (state.justDragged) {
        // dragged, not clicked
        state.justDragged = false;
      } else {
        // clicked, not dragged
        if (d3.event.shiftKey) {
          //Change the title of a node
          var newTitle = prompt("Enter Title",d.title);
          
          if (newTitle != null) {
            d.title = newTitle;
          }
        } else {
          if (state.selectedEdge){
            thisGraph.removeSelectFromEdge();
          }
          var prevNode = state.selectedNode;

          if (!prevNode || prevNode.id !== d.id) {
            thisGraph.replaceSelectNode(d3node, d);
          } else{
            thisGraph.removeSelectFromNode();
          }
        }
        thisGraph.updateGraph();
      }
    }
    state.mouseDownNode = null;
    return;

  }; // end of circles mouseup

  // mousedown on main svg
  GraphCreator.prototype.svgMouseDown = function(){
    this.state.graphMouseDown = true;
    var thisGraph = this,
        state = thisGraph.state;
    if (state.selectedEdge) {
      this.removeSelectFromEdge();
    }
    if (state.selectedNode) {
      this.removeSelectFromNode();
    }
  };

  // mouseup on main svg
  GraphCreator.prototype.svgMouseUp = function(){
    var thisGraph = this,
        state = thisGraph.state;
    // bit of hack to get 
    if (state.justDragged) {
        state.graphMouseDown = false;
        state.justDragged = false;
    }
    if (state.justScaleTransGraph) {
      // dragged not clicked
      state.justScaleTransGraph = false;
    } else if (state.graphMouseDown && d3.event.shiftKey){
      // clicked not dragged from svg
      var xycoords = d3.mouse(thisGraph.svgG.node()),
          d = {id: thisGraph.idct++,
               title: consts.defaultTitle,
               x: xycoords[0],
               y: xycoords[1],
               anchor: "top",
               marked: false
               };
      thisGraph.nodes.push(d);
      thisGraph.updateGraph();
    } else if (state.shiftNodeDrag){
      // dragged from node
      state.shiftNodeDrag = false;
      thisGraph.dragLine.classed("hidden", true);
    }
    thisGraph.updateGraph();
    state.graphMouseDown = false;
  };

  // keydown on main svg
  GraphCreator.prototype.svgKeyDown = function() {
    var thisGraph = this,
        state = thisGraph.state,
        consts = thisGraph.consts;
    // make sure repeated key presses don't register for each keydown
    if(state.lastKeyDown !== -1) return;

    state.lastKeyDown = d3.event.keyCode;
    var selectedNode = state.selectedNode,
        selectedEdge = state.selectedEdge,
        knownKeyPress = true;
  
  switch(d3.event.keyCode) {
    case consts.BACKSPACE_KEY:
    case consts.DELETE_KEY:
      d3.event.preventDefault();
      if (selectedNode){
        thisGraph.nodes.splice(thisGraph.nodes.indexOf(selectedNode), 1);
        thisGraph.spliceLinksForNode(selectedNode);
        state.selectedNode = null;
      } else if (selectedEdge){
        thisGraph.edges.splice(thisGraph.edges.indexOf(selectedEdge), 1);
        state.selectedEdge = null;
      }
      break;
    case consts.UP_KEY:
      if (selectedNode) {
        selectedNode.anchor = "top";
      }
      break;
    case consts.DOWN_KEY:
      if (selectedNode) {
        selectedNode.anchor = "bottom";
      }
      break;
    case consts.LEFT_KEY:
      if (selectedNode) {
        selectedNode.anchor = "left";
      }
      break;
    case consts.RIGHT_KEY:
      if (selectedNode) {
        selectedNode.anchor = "right";
      }
      break;
    case consts.M_KEY:
      if (selectedNode) {
        selectedNode.marked = !selectedNode.marked;
      }
      if (selectedEdge) {
        selectedEdge.marked = !selectedEdge.marked;
        if (selectedEdge.marked) {
          d3.selectAll(".selected").moveToFront();
        }
      }
      break;
    case consts.F_KEY:
      if (selectedEdge) {
        d3.selectAll(".selected").moveToFront();
      }
      break;
    case consts.G_KEY:
        if (state.gridActive) {
          state.gridActive = false;
          svg.selectAll('.vertical').remove();
          svg.selectAll('.horizontal').remove();
        } else {
          state.gridActive = true;
          svg.selectAll('.vertical')
             .data(d3.range(1, width / consts.gridSize))
             .enter().append('line')
             .attr('class', 'vertical')
             .attr('x1', function(d) { return d * consts.gridSize; })
             .attr('y1', 0)
             .attr('x2', function(d) { return d * consts.gridSize; })
             .attr('y2', height)
             .moveToBack();

          svg.selectAll('.horizontal')
             .data(d3.range(1, height / consts.gridSize))
             .enter().append('line')
             .attr('class', 'horizontal')
             .attr('x1', 0)
             .attr('y1', function(d) { return d * consts.gridSize; })
             .attr('x2', width)
             .attr('y2', function(d) { return d * consts.gridSize; })
             .moveToBack();
             
          thisGraph.nodes.map(function(d) {
            d.x = thisGraph.round(Math.max(thisGraph.consts.nodeRadius, Math.min(width - thisGraph.consts.nodeRadius, d.x)), thisGraph.consts.gridSize),
            d.y = thisGraph.round(Math.max(thisGraph.consts.nodeRadius, Math.min(height - thisGraph.consts.nodeRadius, d.y)), thisGraph.consts.gridSize); 
          });
          thisGraph.updateGraph();
       }
    default:
      knownKeyPress = false;
      break;
    }
    if (knownKeyPress) {
      thisGraph.updateGraph();
    }
  };

  GraphCreator.prototype.svgKeyUp = function() {
    this.state.lastKeyDown = -1;
  };

  // call to propagate changes to graph
  GraphCreator.prototype.updateGraph = function(){

    var thisGraph = this,
        consts = thisGraph.consts,
        state = thisGraph.state;

    thisGraph.paths = thisGraph.paths.data(thisGraph.edges, function(d){
      return String(d.source.id) + "+" + String(d.target.id);
    });
    var paths = thisGraph.paths;

    // add new paths
    paths.enter()
      .append("path")
      .classed("link", true)
      .attr("d", function(d){
        return diagonal(d);
      })
      .on("mousedown", function(d){
        thisGraph.pathMouseDown.call(thisGraph, d3.select(this), d);
        }
      )
      .on("mouseup", function(d){
        state.mouseDownLink = null;
      });

    // update existing paths
    paths.classed(consts.selectedClass, function(d){return d === state.selectedEdge;})
         .classed(consts.markedClass, function (d) {return d.marked;})
         .attr("d", function(d){
            return diagonal(d);
          });

    // remove old links
    paths.exit().remove();
    
    // add new nodes
    thisGraph.circles = thisGraph.circles.data(thisGraph.nodes, function(d){ return d.id;});
    var newGs = thisGraph.circles.enter().append("g");

    newGs.classed(consts.circleGClass, true)
      .attr("transform", function(d){return "translate(" + d.x + "," + d.y + ")";})
      .on("mouseover", function(d){
        if (state.shiftNodeDrag){
          d3.select(this).classed(consts.connectClass, true);
        }
      })
      .on("mouseout", function(d){
        d3.select(this).classed(consts.connectClass, false);
      })
      .on("mousedown", function(d){
        thisGraph.circleMouseDown.call(thisGraph, d3.select(this), d);
      })
      .on("mouseup", function(d){
        thisGraph.circleMouseUp.call(thisGraph, d3.select(this), d);
      })
      .call(thisGraph.drag);

    newGs.append("circle")
      .attr("r", String(consts.nodeRadius));
      
    // update existing nodes
    thisGraph.circles.classed(consts.markedClass, function (d) {return d.marked;})
                     .attr("transform", function(d){return "translate(" + d.x + "," + d.y + ")";});

    // add the nodes text
    newGs.append("text");
    
    var updateNode = thisGraph.circles;
    
    // update text
  updateNode.selectAll("text")
        .text(function (d) {return d.title; })
        .attr("dy", "0.25em")
        .attr("x", function (d) {
        switch (d.anchor)
          {
          case "left":
            return -32;
          case "right":
            return 32;
          default:
            return 0;
          } 
         })
        .attr("y", function (d) {
          switch (d.anchor)
          {
          case "top":
            return -32;
          case "bottom":
            return 36;
          default:
            return 0;
          }        
         })
        .attr("text-anchor", function (d) {return thisGraph.anchor(d); });

    // remove old nodes
    thisGraph.circles.exit().remove();
  };

  GraphCreator.prototype.zoomed = function(){
    this.state.justScaleTransGraph = true;
    d3.select("." + this.consts.graphClass)
      .attr("transform", "translate(" + d3.event.translate + ") scale(" + d3.event.scale + ")");
  };

  GraphCreator.prototype.updateWindow = function(svg){
    var docEl = document.documentElement,
        bodyEl = document.getElementsByTagName('body')[0];
    var x = window.innerWidth || docEl.clientWidth || bodyEl.clientWidth;
    var y = window.innerHeight|| docEl.clientHeight|| bodyEl.clientHeight;
    svg.attr("width", x).attr("height", y);
  };

  /**** MAIN ****/

  // warn the user when leaving
  window.onbeforeunload = function(){
    return "You Sure You Want to Quit? Save First!";
  };

  var docEl = document.documentElement,
      bodyEl = document.getElementsByTagName('body')[0];

  var width = window.innerWidth || docEl.clientWidth || bodyEl.clientWidth,
      height =  window.innerHeight|| docEl.clientHeight|| bodyEl.clientHeight;

  // initial node data
  var nodes = [];
  var edges = [];


  /** MAIN SVG **/
  var svg = d3.select(settings.appendElSpec).append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("id", "mainSVG");
  var graph = new GraphCreator(svg, nodes, edges);
      graph.setIdCt(2);
    graph.updateGraph();
    
})(window.d3, window.saveAs, window.Blob);
