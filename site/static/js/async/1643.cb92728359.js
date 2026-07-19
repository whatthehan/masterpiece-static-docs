"use strict";(self.rspackChunkagentic_masterpiece=self.rspackChunkagentic_masterpiece||[]).push([[1643],{646(e,t,r){var l=r(2933);function a(e,t){var r=e.append("foreignObject").attr("width","100000"),a=r.append("xhtml:div");a.attr("xmlns","http://www.w3.org/1999/xhtml");var o=t.label;switch(typeof o){case"function":a.insert(o);break;case"object":a.insert(function(){return o});break;default:a.html(o)}l.AV(a,t.labelStyle),a.style("display","inline-block"),a.style("white-space","nowrap");var n=a.node().getBoundingClientRect();return r.attr("width",n.width).attr("height",n.height),r}r.d(t,{H:()=>a})},2933(e,t,r){var l=r(4963),a=r(9610);function o(e,t){return!!e.children(t).length}function n(e){return s(e.v)+":"+s(e.w)+":"+s(e.name)}var i=/:/g;function s(e){return e?String(e).replace(i,"\\:"):""}function d(e,t){t&&e.attr("style",t)}function c(e,t,r){t&&e.attr("class",t).attr("class",r+" "+e.attr("class"))}function p(e,t){var r=t.graph();if(l.A(r)){var o=r.transition;if(a.A(o))return o(e)}return e}r.d(t,{AV:()=>d,De:()=>o,c$:()=>p,gh:()=>n,nh:()=>c})},5937(e,t,r){var l=r(9601),a=r(1005);t.A=(e,t)=>l.A.lang.round(a.A.parse(e)[t])},3910(e,t,r){var l=r(2696),a=r(2514),o=r(1768);r(2693),r(697),r(4795),r(4075),r(4353),r(6750),r(9418);let n={parser:l.p,db:l.f,renderer:a.f,styles:a.a,init:e=>{e.flowchart||(e.flowchart={}),e.flowchart.arrowMarkerAbsolute=e.arrowMarkerAbsolute,(0,o.p)({flowchart:{arrowMarkerAbsolute:e.arrowMarkerAbsolute}}),a.f.setConf(e.flowchart),l.f.clear(),l.f.setGen("gen-2")}};r.d(t,{},{diagram:n})},2514(e,t,r){var l=r(2693),a=r(646),o=r(697),n=r(7082),i=r(1768),s=r(5937),d=r(5582);let c={},p=async function(e,t,r,l,o,n){let s=l.select(`[id="${r}"]`);for(let r of Object.keys(e)){let l,d=e[r],c="default";d.classes.length>0&&(c=d.classes.join(" ")),c+=" flowchart-label";let p=(0,i.k)(d.styles),b=void 0!==d.text?d.text:d.id;if(i.l.info("vertex",d,d.labelType),"markdown"===d.labelType)i.l.info("vertex",d,d.labelType);else if((0,i.m)((0,i.c)().flowchart.htmlLabels)){let e={label:b};(l=(0,a.H)(s,e).node()).parentNode.removeChild(l)}else{let e=o.createElementNS("http://www.w3.org/2000/svg","text");for(let t of(e.setAttribute("style",p.labelStyle.replace("color:","fill:")),b.split(i.e.lineBreakRegex))){let r=o.createElementNS("http://www.w3.org/2000/svg","tspan");r.setAttributeNS("http://www.w3.org/XML/1998/namespace","xml:space","preserve"),r.setAttribute("dy","1em"),r.setAttribute("x","1"),r.textContent=t,e.appendChild(r)}l=e}let w=0,f="";switch(d.type){case"round":w=5,f="rect";break;case"square":case"group":default:f="rect";break;case"diamond":f="question";break;case"hexagon":f="hexagon";break;case"odd":case"odd_right":f="rect_left_inv_arrow";break;case"lean_right":f="lean_right";break;case"lean_left":f="lean_left";break;case"trapezoid":f="trapezoid";break;case"inv_trapezoid":f="inv_trapezoid";break;case"circle":f="circle";break;case"ellipse":f="ellipse";break;case"stadium":f="stadium";break;case"subroutine":f="subroutine";break;case"cylinder":f="cylinder";break;case"doublecircle":f="doublecircle"}let h=await (0,i.r)(b,(0,i.c)());t.setNode(d.id,{labelStyle:p.labelStyle,shape:f,labelText:h,labelType:d.labelType,rx:w,ry:w,class:c,style:p.style,id:d.id,link:d.link,linkTarget:d.linkTarget,tooltip:n.db.getTooltip(d.id)||"",domId:n.db.lookUpDomId(d.id),haveCallback:d.haveCallback,width:"group"===d.type?500:void 0,dir:d.dir,type:d.type,props:d.props,padding:(0,i.c)().flowchart.padding}),i.l.info("setNode",{labelStyle:p.labelStyle,labelType:d.labelType,shape:f,labelText:h,rx:w,ry:w,class:c,style:p.style,id:d.id,domId:n.db.lookUpDomId(d.id),width:"group"===d.type?500:void 0,type:d.type,dir:d.dir,props:d.props,padding:(0,i.c)().flowchart.padding})}},b=async function(e,t,r){let a,o;i.l.info("abc78 edges = ",e);let n=0,s={};if(void 0!==e.defaultStyle){let t=(0,i.k)(e.defaultStyle);a=t.style,o=t.labelStyle}for(let r of e){n++;let d="L-"+r.start+"-"+r.end;void 0===s[d]?s[d]=0:s[d]++,i.l.info("abc78 new entry",d,s[d]);let p=d+"-"+s[d];i.l.info("abc78 new link id to be used is",d,p,s[d]);let b="LS-"+r.start,w="LE-"+r.end,f={style:"",labelStyle:""};switch(f.minlen=r.length||1,"arrow_open"===r.type?f.arrowhead="none":f.arrowhead="normal",f.arrowTypeStart="arrow_open",f.arrowTypeEnd="arrow_open",r.type){case"double_arrow_cross":f.arrowTypeStart="arrow_cross";case"arrow_cross":f.arrowTypeEnd="arrow_cross";break;case"double_arrow_point":f.arrowTypeStart="arrow_point";case"arrow_point":f.arrowTypeEnd="arrow_point";break;case"double_arrow_circle":f.arrowTypeStart="arrow_circle";case"arrow_circle":f.arrowTypeEnd="arrow_circle"}let h="",u="";switch(r.stroke){case"normal":h="fill:none;",void 0!==a&&(h=a),void 0!==o&&(u=o),f.thickness="normal",f.pattern="solid";break;case"dotted":f.thickness="normal",f.pattern="dotted",f.style="fill:none;stroke-width:2px;stroke-dasharray:3;";break;case"thick":f.thickness="thick",f.pattern="solid",f.style="stroke-width: 3.5px;fill:none;";break;case"invisible":f.thickness="invisible",f.pattern="solid",f.style="stroke-width: 0;fill:none;"}if(void 0!==r.style){let e=(0,i.k)(r.style);h=e.style,u=e.labelStyle}f.style=f.style+=h,f.labelStyle=f.labelStyle+=u,void 0!==r.interpolate?f.curve=(0,i.n)(r.interpolate,l.lUB):void 0!==e.defaultInterpolate?f.curve=(0,i.n)(e.defaultInterpolate,l.lUB):f.curve=(0,i.n)(c.curve,l.lUB),void 0===r.text?void 0!==r.style&&(f.arrowheadStyle="fill: #333"):(f.arrowheadStyle="fill: #333",f.labelpos="c"),f.labelType=r.labelType,f.label=await (0,i.r)(r.text.replace(i.e.lineBreakRegex,"\n"),(0,i.c)()),void 0===r.style&&(f.style=f.style||"stroke: #333; stroke-width: 1.5px;fill:none;"),f.labelStyle=f.labelStyle.replace("color:","fill:"),f.id=p,f.classes="flowchart-link "+b+" "+w,t.setEdge(r.start,r.end,f,n)}},w=async function(e,t,r,a){let s,d;i.l.info("Drawing flowchart");let c=a.db.getDirection();void 0===c&&(c="TD");let{securityLevel:w,flowchart:f}=(0,i.c)(),h=f.nodeSpacing||50,u=f.rankSpacing||50;"sandbox"===w&&(s=(0,l.Ltv)("#i"+t));let g="sandbox"===w?(0,l.Ltv)(s.nodes()[0].contentDocument.body):(0,l.Ltv)("body"),y="sandbox"===w?s.nodes()[0].contentDocument:document,k=new o.T({multigraph:!0,compound:!0}).setGraph({rankdir:c,nodesep:h,ranksep:u,marginx:0,marginy:0}).setDefaultEdgeLabel(function(){return{}}),x=a.db.getSubGraphs();i.l.info("Subgraphs - ",x);for(let e=x.length-1;e>=0;e--)d=x[e],i.l.info("Subgraph - ",d),a.db.addVertex(d.id,{text:d.title,type:d.labelType},"group",void 0,d.classes,d.dir);let v=a.db.getVertices(),m=a.db.getEdges();i.l.info("Edges",m);let S=0;for(S=x.length-1;S>=0;S--){d=x[S],(0,l.Ubm)("cluster").append("text");for(let e=0;e<d.nodes.length;e++)i.l.info("Setting up subgraphs",d.nodes[e],d.id),k.setParent(d.nodes[e],d.id)}await p(v,k,t,g,y,a),await b(m,k);let T=g.select(`[id="${t}"]`),_=g.select("#"+t+" g");if(await (0,n.r)(_,k,["point","circle","cross"],"flowchart",t),i.u.insertTitle(T,"flowchartTitleText",f.titleTopMargin,a.db.getDiagramTitle()),(0,i.o)(k,T,f.diagramPadding,f.useMaxWidth),a.db.indexNodes("subGraph"+S),!f.htmlLabels)for(let e of y.querySelectorAll('[id="'+t+'"] .edgeLabel .label')){let t=e.getBBox(),r=y.createElementNS("http://www.w3.org/2000/svg","rect");r.setAttribute("rx",0),r.setAttribute("ry",0),r.setAttribute("width",t.width),r.setAttribute("height",t.height),e.insertBefore(r,e.firstChild)}Object.keys(v).forEach(function(e){let r=v[e];if(r.link){let a=(0,l.Ltv)("#"+t+' [id="'+e+'"]');if(a){let e=y.createElementNS("http://www.w3.org/2000/svg","a");e.setAttributeNS("http://www.w3.org/2000/svg","class",r.classes.join(" ")),e.setAttributeNS("http://www.w3.org/2000/svg","href",r.link),e.setAttributeNS("http://www.w3.org/2000/svg","rel","noopener"),"sandbox"===w?e.setAttributeNS("http://www.w3.org/2000/svg","target","_top"):r.linkTarget&&e.setAttributeNS("http://www.w3.org/2000/svg","target",r.linkTarget);let t=a.insert(function(){return e},":first-child"),l=a.select(".label-container");l&&t.append(function(){return l.node()});let o=a.select(".label");o&&t.append(function(){return o.node()})}}})};r.d(t,{},{a:e=>{var t;let r,l,a,o;return`.label {
    font-family: ${e.fontFamily};
    color: ${e.nodeTextColor||e.textColor};
  }
  .cluster-label text {
    fill: ${e.titleColor};
  }
  .cluster-label span,p {
    color: ${e.titleColor};
  }

  .label text,span,p {
    fill: ${e.nodeTextColor||e.textColor};
    color: ${e.nodeTextColor||e.textColor};
  }

  .node rect,
  .node circle,
  .node ellipse,
  .node polygon,
  .node path {
    fill: ${e.mainBkg};
    stroke: ${e.nodeBorder};
    stroke-width: 1px;
  }
  .flowchart-label text {
    text-anchor: middle;
  }
  // .flowchart-label .text-outer-tspan {
  //   text-anchor: middle;
  // }
  // .flowchart-label .text-inner-tspan {
  //   text-anchor: start;
  // }

  .node .katex path {
    fill: #000;
    stroke: #000;
    stroke-width: 1px;
  }

  .node .label {
    text-align: center;
  }
  .node.clickable {
    cursor: pointer;
  }

  .arrowheadPath {
    fill: ${e.arrowheadColor};
  }

  .edgePath .path {
    stroke: ${e.lineColor};
    stroke-width: 2.0px;
  }

  .flowchart-link {
    stroke: ${e.lineColor};
    fill: none;
  }

  .edgeLabel {
    background-color: ${e.edgeLabelBackground};
    rect {
      opacity: 0.5;
      background-color: ${e.edgeLabelBackground};
      fill: ${e.edgeLabelBackground};
    }
    text-align: center;
  }

  /* For html labels only */
  .labelBkg {
    background-color: ${t=e.edgeLabelBackground,l=(r=s.A)(t,"r"),a=r(t,"g"),o=r(t,"b"),d.A(l,a,o,.5)};
    // background-color: 
  }

  .cluster rect {
    fill: ${e.clusterBkg};
    stroke: ${e.clusterBorder};
    stroke-width: 1px;
  }

  .cluster text {
    fill: ${e.titleColor};
  }

  .cluster span,p {
    color: ${e.titleColor};
  }
  /* .cluster div {
    color: ${e.titleColor};
  } */

  div.mermaidTooltip {
    position: absolute;
    text-align: center;
    max-width: 200px;
    padding: 2px;
    font-family: ${e.fontFamily};
    font-size: 12px;
    background: ${e.tertiaryColor};
    border: 1px solid ${e.border2};
    border-radius: 2px;
    pointer-events: none;
    z-index: 100;
  }

  .flowchartTitleText {
    text-anchor: middle;
    font-size: 18px;
    fill: ${e.textColor};
  }
`},f:{setConf:function(e){for(let t of Object.keys(e))c[t]=e[t]},addVertices:p,addEdges:b,getClasses:function(e,t){return t.db.getClasses()},draw:w}})}}]);