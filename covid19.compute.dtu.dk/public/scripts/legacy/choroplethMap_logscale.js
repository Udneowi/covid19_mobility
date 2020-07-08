class MovementsMap {

	constructor(data, geoData, uniqueId) {
		// Variables
		this.data = data;
		this.geoData = geoData;
		this.uniqueId = uniqueId;
		this.inMax = round(data._meta.variables.inMax, 1e2);
		this.outMax = data._meta.variables.outMax;
		this.datetime = data._meta.datetime;
		this.t = data._meta.defaults.t;
		this.radioOption = data._meta.defaults.radioOption;
		this.idx0or1 = data._meta.defaults.idx0or1;
		this.mode = 'linear';

		// Dimensions
		let figureWidth = 770,
			figureHeight = 770;
		let maindiv = document.getElementById("vis-" + this.uniqueId);
		maindiv.style.width = figureWidth + "px";
		maindiv.style.height = figureHeight + "px";
		this.width = figureWidth;
		this.height = figureHeight;
		this.rwidth = 180;
		this.rheight = 27;

		// Parse the date / time
		this.parseDate = d3.timeParse("%Y-%m-%d %H:%M:%S");
		this.formatDate = d3.timeFormat("%e %B");

		// Color scale
		this.n_steps = 5;
		this.colorScale = chroma.scale(['#b71540', '#e55039', '#C4C4C4', '#4a69bd', '#0c2461']);

		// Define tooltip div
		this.tooltip = d3.select("body").append("div")
			.attr("class", "tooltip")
			.style("display", "none");

		// SVG
		this.svg = d3.select("#vis-" + this.uniqueId)
			.append("svg")
				.attr("width", this.width)
				.attr("height", this.height);

		this.g = this.svg.append("g");

		// Zooming and panning
		let zoom = d3.zoom()
			.extent([[100, 18], [this.width, this.height]])
			.scaleExtent([1, 4])
			.on("zoom", () => this.zoomed());
		this.svg.call(zoom);
	}	


	// Start, clear and recreate
	// ------------------

	// Start 1 (called on instance)
	setup() {
		this.mapNamesToPolygons();
		this.setScaling();
		this.setColorDomain();
		this.setKeyEvents();
		this.resetState();
	}

	// Start 2 (called on instance)
	drawLayout() {
		this.setRadio();
		this.setSlider();
		this.drawLogLin();
	}

	// Start 3 (called on instance)
	drawData() {
		this.drawMap();
		this.setLegend();
	}

	// Restart 1
	clearData() {
		this.svg.selectAll('polygon').remove()
		this.svg.selectAll('rect').remove()
		this.svg.selectAll('text').remove()
	}

	// Restart
	redrawData() {
		this.setColorDomain();
		this.drawMap();
		this.setLegend();
		this.drawLogLin();
	}


	// Setup
	// -----

	mapNamesToPolygons() {
		this.namePolygonMap = {};
		this.geoData.forEach(d => {
			this.namePolygonMap[d.kommune] = d.polygons;
		})
	}

	meanAngle(alpha) {
		return Math.atan2(
			1/alpha.length * d3.sum(alpha.map(a => Math.sin(a / 180 * Math.PI))),
			1/alpha.length * d3.sum(alpha.map(a => Math.cos(a / 180 * Math.PI)))
		) * 180 / Math.PI;
	}

	diffAngle(a, b) {
		return Math.atan2(
			Math.sin(b/180*Math.PI-a/180*Math.PI),
			Math.cos(b/180*Math.PI-a/180*Math.PI),
		) * 180 / Math.PI;
	}

	getBoundingBox() {
		let lats = [],
			lons = [];

		this.geoData.forEach(arr => {
			arr.polygons.forEach(poly => {
				poly.forEach(point => {
					lats.push(point[1]);
					lons.push(point[0]);
				})
			})
		})

		let midLat = d3.mean(lats);
		let midLon = this.meanAngle(lons);

		let lats_max_min = this.minMaxArray(lats);
		let lons_max_min = this.minMaxArray(lons.map(l => this.diffAngle(midLon, l)));

		return [
			lats_max_min.min,
			lats_max_min.max,
			lons[lons_max_min.minIdx],
			lons[lons_max_min.maxIdx],
			midLat,
			midLon
		];
	}

	// projection([lon, lat]) {
	// 	// https://mathworld.wolfram.com/GnomonicProjection.html
	// 	let lam0 = lon / 180 * Math.PI;
	// 	let phi1 = lat / 180 * Math.PI;
	// 	let cosc = Math.sin(phi1) * Math.sin(this.phi) + Math.cos(phi1) * Math.cos(this.phi) * Math.cos(this.lam - lam0);
		
	// 	let x = Math.cos(this.phi) * Math.sin(this.lam - lam0) / cosc;
	// 	let y = Math.cos(phi1) * Math.sin(this.phi) - Math.sin(phi1) * Math.cos(this.phi) * Math.cos(this.lam - lam0) / cosc;

	// 	return [x, y];
	// }

	projection([lon, lat]) {
		// https://mathworld.wolfram.com/OrthographicProjection.html
		let lam0 = lon / 180 * Math.PI;
		let phi1 = lat / 180 * Math.PI;
		
		let x = Math.cos(this.phi) * Math.sin(this.lam - lam0);
		let y = Math.cos(phi1) * Math.sin(this.phi) - Math.sin(phi1) * Math.cos(this.phi) * Math.cos(this.lam - lam0);

		return [x, y];
	}

	proj([lon, lat]) {
		let pp = this.projection([lon, lat]);
		let newpp = [this.xScaler(pp[0]), this.yScaler(pp[1])];
		return newpp;
	}

	setScaling() {
		// lat,lon bounding box
		let bbCoords = this.getBoundingBox();
		let latMin = bbCoords[0],
			latMax = bbCoords[1],
			lonMin = bbCoords[2],
			lonMax = bbCoords[3],
			latMid = bbCoords[4],
			lonMid = bbCoords[5];

		// Center point of projection
		this.lam = lonMid / 180 * Math.PI;
		this.phi = latMid / 180 * Math.PI;

		// Projection bounding box
		let lowerLeft = this.projection([lonMin, latMin]),
    		upperLeft = this.projection([lonMin, latMax]),
    		upperRight = this.projection([lonMax, latMax]),
    		lowerRight = this.projection([lonMax, latMin]);

    	// Extremes
    	let maxX = Math.min(lowerLeft[0], upperLeft[0]),
    		minX = Math.max(lowerRight[0], upperRight[0]),
    		minY = upperLeft[1],
    		maxY = lowerLeft[1];

    	// Width and height
		let mapWidth = maxX - minX,
			mapHeight = maxY - minY;

		// Set scaling according to aspect
		if (mapWidth < mapHeight) {
	    	this.xScaler = d3.scaleLinear().domain([maxY, minY]).range([0, this.height]);
			this.yScaler = d3.scaleLinear().domain([maxY, minY]).range([this.height, 0]);
		} else {
			this.xScaler = d3.scaleLinear().domain([minX, maxX]).range([this.width, 0]);
			this.yScaler = d3.scaleLinear().domain([minX, maxX]).range([0, this.width]);
		}
	}

	setColorDomain() {
		this.domain = undefined;
		if (this.radioOption == "percent_change") {
			if (this.mode == 'linear')
				this.domain = [-100, 100];
			else if (this.mode == 'log')
				this.domain = [-Math.log(101), Math.log(101)];
		}
		else {
			let c = this.inMax > 1 ? 1 : 100;
			if (this.mode == 'linear')
				this.domain = [-this.inMax, this.inMax];
			else if (this.mode == 'log')
				this.domain = [-Math.log(this.inMax * c + 1), Math.log(this.inMax * c + 1)];
		}
		this.colorScale.domain(this.domain)
	}

	setKeyEvents() {
		document.onkeydown = evt => {
		    evt = evt || window.event;
		    if (evt.key === "Escape" || evt.key === "Esc") {
		    	this.resetState();
		    	this.clearData();
		    	this.redrawData();
		    } else
		    if (evt.key === "Shift") {
		    	this.idx0or1 = 1;
		    	if (typeof this.selected != 'undefined') {
		    		this.tooltipSelected(this.hovering);
		    		this.recolorRegions(this.selected);
		    	}
		    }
		};

		document.onkeyup = evt => {
		    evt = evt || window.event;
		    if (evt.key === "Shift") {
		    	this.idx0or1 = 0;
		    	if (typeof this.selected != 'undefined') {
		    		this.tooltipSelected(this.hovering);
		    		this.recolorRegions(this.selected);
		    	}
		    }
		};
	}

	resetState() {
		this.selected = undefined;
		this.hovering = undefined;
		this.selected_polygons = [];
	}

	// Layout elements
	// ---------------

	setLegend() {
		let legendRange,
			legendTitle;
		if (this.radioOption == "percent_change") {
			// legendRange = d3.range(-this.n_steps, this.n_steps).map(v => v * this.domain[1])
			if (this.mode == 'linear') 
				legendRange = this.linspace(this.domain[0] / 100, this.domain[1] / 100, this.n_steps * 2 - 1);
			else if (this.mode == 'log') {
				legendRange = [
					...this.logspace(Math.log(1), this.domain[1], 4).reverse().map(v => -v/100),
					0, ...this.logspace(Math.log(1), this.domain[1], 4).map(v => v/100)
				];
			}
			legendTitle = this.data._meta.variables.legend_label_relative;
		}
		else {
			if (this.mode == 'linear')
				legendRange = this.linspace(0, this.domain[1], this.n_steps);
			else if (this.mode == 'log')
				legendRange = this.logspace(Math.log(1), this.domain[1], this.n_steps);
			legendTitle = this.data._meta.variables.legend_label_count;
		}

		console.log(legendRange)

		// Title text
		this.svg.append('text')
			.attr('x', this.width-120)
			.attr('y', 20)
			.attr('font-weight', 700)
			.text(legendTitle)

		// Rects and labels
		legendRange = ["No data", ...legendRange];
		legendRange.forEach((i, idx) => {

			// Rects
			this.svg.append('rect')
				.attr('x', this.width-120)
				.attr('y', idx * 23 + 60)
				.attr('width', 15)
				.attr('height', 15)
				.attr('fill', () => {
					if (idx == 0)
						return 'url(#thinlines)';
					else {
						if (this.mode == 'linear') {
							return this.getColor(i);
						}
						else if (this.mode == 'log') {
							return this.getColor(i);
						}
					}
				})

			// labels
			this.svg.append('text')
				.attr('x', this.width-95)
				.attr('y', idx * 23 + 72.5)
				.attr('font-size', 13)
				.text(() => {
					if (idx == 0)
						return i;
					else {
						if (this.inMax <= 1) {
							if (this.radioOption == "percent_change" || this.mode == 'linear')
								return round(i * 100, 1e0) + "%";
							else 
								return round(i, 1e0) + "%";
						}
						else if (i <= 100)
							return round(i, 1e0);
						else if (i <= 10_000)
							return round(i, 1e-2);
						else if (i <= 1_000_000)
							return round(i / 1e3, 1e0) + "K";
						else
							return round(i / 1e6, 1e1) + "M";
					}
				})
		})
	}

	setRadio() {
		this.radiosvg = d3.select("#radio-" + this.uniqueId)
			.append("svg")
			.attr('width', this.rwidth)
			.attr('height', this.rheight)
			.style('margin-top', 5);

		this.data._meta.radioOptions.forEach((option, i) => {
			// radio boxes
			this.radiosvg.append('rect')
				.attr('class', () => {
					if (option == this.radioOption)
						return 'radio-rect selected';
					else
						return 'radio-rect'
				})
				.attr('id', 'radio-rect-' + option)
				.attr('x', this.rwidth/3 * i)
				.attr('y', 0)
				.attr('width', this.rwidth/3)
				.attr('height', this.rheight)
				.on('click', () => this.radioClick(option))

			// radio texts
			this.radiosvg.append('text')
				.attr('class', () => {
					if (option == this.radioOption) {
						return 'radio-text selected';
					}
					else
						return 'radio-text'
				})
				.attr('id', 'radio-text-' + option)
				.attr("x", this.rwidth/3 * i + this.rwidth/6)
				.attr("y", this.rheight / 2 + 4)
				.attr('font-size', 12)
				.text(() => {
					if (option == 'crisis')
						return 'On date';
					if (option == 'baseline')
						return 'Baseline';
					if (option == 'percent_change')
						return 'Change';
				})
				.on('click', () => this.radioClick(option));
		})
	}

	setSlider() {
		// Define
		let N = this.datetime.length
		let sliderStep = d3.sliderBottom()
			.min(0)
			.max(N-1)
			.width(this.width - this.rwidth - 60)
			.tickValues(d3.range(2, N, 14))
			.tickFormat(i => this.idxToDate(i))
			.step(1)
			.default(this.t)
			.on('onchange', t => {
				this.t = t;
				this.clearData();
				this.redrawData();
			});

		// Append to div
		let gStep = d3.select('#slider-' + this.uniqueId)
			.append('svg')
			.attr('width', this.width - this.rwidth)
			.attr('height', 60)
			.append('g')
			.attr('transform', 'translate(15,10)');

		gStep.call(sliderStep);
	}

	drawLogLin() {
		if (typeof this.mode != "undefined") {  // in the figure this.mode should be read from the input data
			// (        /    )
			this.svg.append("text")
				.attr('x', this.width-120)
				.attr('y', 40)
				.style("text-anchor", "left")
				.html("(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)")

			// rel
			this.svg.append("text")
				.attr('x', this.width-114)
				.attr('y', 40)
				.attr('class', 'toggle')
				.attr("id", 'toggleLinear' + this.uniqueId)
				.style("text-anchor", "left")
				.style("font-weight", this.mode == 'linear' ? 700 : 300)
				.style('cursor', 'pointer')
				.text("linear")
				.on('click', () => this.linLogLabelClick('linear'));

			// log
			this.svg.append("text")
				.attr('x', this.width-63)
				.attr('y', 40)
				.attr('class', 'toggle')
				.attr("id", "toggleLog" + this.uniqueId)
				.style("text-anchor", "left")
				.style("font-weight", this.mode == 'log' ? 700 : 300)
				.style('cursor', 'pointer')
				.text("log")
				.on('click', () => this.linLogLabelClick('log'));
		}
	}


	// Plot data
	// ---------

	drawMap() {
		for (let datum of this.geoData) {
			let dataExists = this.exists(datum.kommune);
			this.g.selectAll(idify(datum.kommune))
				.data(datum.polygons)
				.enter().append("polygon")
			    .attr("points", polygon => polygon.map(p => {
			    		let pp = this.proj(p);
			    		return [pp[0], pp[1]].join(",")
					}).join(" ")
			    )
			    .attr("class", 'map-polygon-movements')
			    .attr("id", idify(datum.kommune))
			    .style('fill', () => {
			    	if (typeof this.selected == 'undefined')
			    		return this.defaultFill(datum.kommune, this.t)
			    })
				.on('mouseover', polygon => {
					if (dataExists) {
						this.mouseover();
						this.hovering = datum.kommune;
						if (typeof this.selected == 'undefined') {
							this.highlightRegion(datum.polygons, 'black');
						} else {
							if (datum.kommune != this.selected)
								this.highlightRegion(datum.polygons, 'grey');
						}
					}
				})
				.on('mousemove', () => {
					if (dataExists) {
						if (typeof this.selected == 'undefined')
							this.tooltipDefault(datum.kommune);
						else {
							this.tooltipSelected(datum.kommune);

						}
					}
				})
				.on('mouseout', polygon => {
					if (dataExists) {
						this.mouseout();
						this.hovering = undefined;
						if (datum.kommune != this.selected)
							this.unhighlightRegion()
					}
				})
				.on('click', polygon => {
					if (dataExists) {
						this.unhighlightAllRegions();
						this.highlightRegion(datum.polygons, 'black');
						if (typeof this.selected == 'undefined') {
							this.recolorRegions(datum.kommune)
							this.selected = datum.kommune;
							this.tooltipSelected(datum.kommune);
						} else {
							if (datum.kommune == this.selected) {
								this.restoreDefault(this.t);
								this.selected = undefined;
								this.tooltipDefault(datum.kommune);
							} else {
								this.recolorRegions(datum.kommune);
								this.selected = datum.kommune;
								this.tooltipSelected(datum.kommune);
							}
						}
					}
				});
		}

		if (typeof this.selected != 'undefined') {
			this.recolorRegions(this.selected);
			this.highlightRegion(this.namePolygonMap[this.selected], 'black');
		}
	}


	// Event handling
	// --------------

	// Mouse
	mouseover() {
		this.tooltip.style("display", "inline");
	}

	mouseout() {
		this.tooltip.style("display", "none");
	}

	tooltipDefault(d) {
		let crisis = this.data[d]["_" + d]['crisis'][this.t][this.idx0or1];
		let baseline = this.data[d]["_" + d]['baseline'][this.t][this.idx0or1];
		let percent_change = this.data[d]["_" + d]['percent_change'][this.t][this.idx0or1];

		let tooltiptext = "";
		if (this.inMax <= 1) {
			tooltiptext += "Share of <b>" + d + "</b> population<br>going to work anywhere<br><br>";
			tooltiptext += "On date: <b>" + round(crisis * 100, 1e2) + "%</b><br>";
			tooltiptext += "Baseline: <b>" + round(baseline * 100, 1e2) + "%</b><br>";
		}
		else {
			tooltiptext += "Trips starting in <b>" + d + "</b>:<br><br>";
			tooltiptext += "On date: <b>" + insertKSeperators(round(crisis, 1e0)) + "</b><br>";
			tooltiptext += "Baseline: <b>" + insertKSeperators(round(baseline, 1e0)) + "</b><br>";
		}
		if (baseline > 0)
			tooltiptext += "Deviation: <b>" + round(percent_change * 100, 1e2) + "%</b>";

		this.tooltip
			.html(tooltiptext)
			.style("left", (d3.event.pageX + 10) + "px")
			.style("top", (d3.event.pageY - 10) + "px");
	}

	tooltipSelected(d) {

		let crisis = 0,
			baseline = 0, 
			percent_change = 'NaN';

		if (d in this.data[this.selected]) {
			if (this.t in this.data[this.selected][d]['crisis'])
				crisis = this.data[this.selected][d]['crisis'][this.t][this.idx0or1];
			if (this.t in this.data[this.selected][d]['baseline'])
				baseline = this.data[this.selected][d]['baseline'][this.t][this.idx0or1];
			if (this.t in this.data[this.selected][d]['percent_change'])
				percent_change = this.data[this.selected][d]['percent_change'][this.t][this.idx0or1];			
		}

		let tooltiptext = "";
		if (this.inMax <= 1) {
			if (this.idx0or1 == 0) 
				tooltiptext += "Share of <b>" + this.selected + "</b> population<br>going to work in <b>" + this.hovering + "</b><br><br>";
			else if (this.idx0or1 == 1) 
				tooltiptext += "Share of <b>" + this.hovering + "</b> population<br>going to work in <b>" + this.selected + "</b><br><br>";
			tooltiptext += "On date: <b>" + round(crisis * 100, 1e2) + "%</b><br>";
			tooltiptext += "Baseline: <b>" + round(baseline * 100, 1e2) + "%</b><br>";
		} else {
			if (this.idx0or1 == 0) 
				tooltiptext += "Trips starting in <b>" + this.selected + "</b> that end in <b>" + this.hovering + "</b><br><br>";
			else if (this.idx0or1 == 1) 
				tooltiptext += "Trips starting in <b>" + this.hovering + "</b> that end in <b>" + this.selected + "</b><br><br>";
			tooltiptext += "On date: <b>" + insertKSeperators(round(crisis, 1e0)) + "</b><br>";
			tooltiptext += "Baseline: <b>" + insertKSeperators(round(baseline, 1e0)) + "</b><br>";

		if (baseline > 0)
			tooltiptext += "Deviation: <b>" + round(percent_change * 100, 1e2) + "%</b>";	
		}

		if (d3.event != null) {
			this.tooltip
				.html(tooltiptext)
				.style("left", (d3.event.pageX + 10) + "px")
				.style("top", (d3.event.pageY - 10) + "px");
			this.eventX = d3.event.pageX;
			this.eventY = d3.event.pageY;
		} else {
			this.tooltip
				.html(tooltiptext)
				.style("left", (this.eventX + 10) + "px")
				.style("top", (this.eventY - 10) + "px");
		}
	}

	// Coloring
	defaultFill(d, t) {
		if (this.exists(d)) {
    		let value = this.data[d]["_" + d][this.radioOption][this.t][0];
    		return this.getColor(value);
    	} else {
    		return 'url(#thinlines)';
    	}
	}

	highlightRegion(d, color) {
		this.selected_polygons.push(
			d.map(polygon => {
				return this.g.append("polygon")
				    .attr("points", polygon.map(p => {
					    	let pp = this.proj(p);
				    		return [pp[0], pp[1]].join(",")
				    	}).join(" ")
				    )
				    .style('fill', 'none')
				    .style('stroke', color)
				    .style('stroke-width', 1)
			})
		)
	}

	unhighlightRegion() {
		this.selected_polygons[this.selected_polygons.length-1].forEach(polygon => {
			polygon.remove();
		})
		this.selected_polygons.pop()
	}

	unhighlightAllRegions() {
		this.selected_polygons.forEach(multiPolygon => {
			multiPolygon.forEach(polygon => {
				polygon.remove();
			})
		})
		this.selected_polygons = [];
	}

	recolorRegions(d) {
		// Make everything gray
		this.svg.selectAll('.map-polygon-movements')
			.style('fill', '#ecf0f1')

		// Color each kommune by their flow into `d`
		Object.keys(this.data[d]).forEach(neighbor => {
			if (this.t in this.data[d][neighbor][this.radioOption]) {
				let count = this.data[d][neighbor][this.radioOption][this.t][this.idx0or1]
				if (count != 0) {
					this.svg.selectAll('#' + idify(neighbor))
						.style('fill', this.getColor(count));
				}
			}
		})
	}

	restoreDefault(t) {
		this.geoData.forEach(datum_ => {
			this.svg.selectAll('#' + idify(datum_.kommune))
				.style('fill', this.defaultFill(datum_.kommune, this.t))
		})
	}

	// Zooming and panning
	zoomed() {
		this.g.attr("transform", d3.event.transform);
	}

	// Buttons and slider
	radioClick(option) {
		if (option != this.radioOption) {
			this.radiosvg.select('#radio-rect-' + this.radioOption)
				.attr('class', 'radio-rect');
			this.radiosvg.select('#radio-rect-' + option)
				.attr('class', 'radio-rect selected');
			this.radioOption = option;
			this.clearData();
			this.redrawData();
		}
	}

	updateCrisis() {
		this.radioOption = 'crisis';
		this.clearData();
		this.redrawData();
	}

	updateBaseline() {
		this.radioOption = 'baseline';
		this.clearData();
		this.redrawData();
	}

	updatePercentChange() {
		this.radioOption = 'percent_change';
		this.clearData();
		this.redrawData();
	}

	linLogLabelClick(mode) {
		if (mode != this.mode) {
			if (mode == 'linear') {
				this.svg.select('#toggleLinear' + this.uniqueId)
					.style('font-weight', 700);
				this.svg.select('#toggleLog' + this.uniqueId)
					.style('font-weight', 300);
				this.mode = 'linear';
			} else
			if (mode == 'log') {
				this.svg.select('#toggleLinear' + this.uniqueId)
					.style('font-weight', 300);
				this.svg.select('#toggleLog' + this.uniqueId)
					.style('font-weight', 700);
				this.mode = 'log';
			}
		}
		this.clearData();
		this.redrawData();
	}



	// Utilities
	// ---------

	getColor(value) {
		if (this.radioOption == 'percent_change')
			value *= 100;

		if (this.mode == 'linear') {
			return this.colorScale(value).hex()
		}
		else if (this.mode == 'log') {
			if (value < 1)
				return this.colorScale(-Math.log(-value + 1)).hex()
			else
				return this.colorScale(Math.log(value + 1)).hex()
		}

	}

	idxToDate(i) {
		let days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		let date = this.parseDate(this.datetime[0]);
		date.setHours(date.getHours() + 24 * i);
		let dateString = "";
		dateString += days[date.getDay()] + " ";
		dateString += date.getDate() + "/";
		dateString += date.getMonth() + 1
		return dateString
	}

	exists(d) {
		return d in this.data && this.t in this.data[d]["_" + d][this.radioOption];
	}

	haversine(lat1, lon1, lat2, lon2) {
		function toRad(x) {
			return x * Math.PI / 180;
		}

		let R = 6371e3;

		let dLat = toRad(lat2 - lat1);
		let dLon = toRad(lon2 - lon1)
		let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
			Math.sin(dLon / 2) * Math.sin(dLon / 2);
		let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

		return R * c;
	}

	minMaxArray(arr) {
	    let max = -Number.MAX_VALUE,
	        min = Number.MAX_VALUE;
	    let maxIdx, minIdx;

	    arr.forEach(function(e, i) {
	        if (max < e) {
	        	max = e;
	        	maxIdx = i;
	        }
	        if (min > e) {
	        	min = e;
	        	minIdx = i;
	        }
	    });
	    return {max: max, min: min, maxIdx: maxIdx, minIdx: minIdx};
    }

	linspace(a, b, n) {
		let every = (b - a) / (n - 1),
			range = [];
		for (let i = a; i < b; i += every)
			range.push(i);
		return range.length == n ? range : range.concat(b);
	}
	
	logspace(a, b, n, exponent) {
		exponent = exponent == undefined ? Math.exp(1) : exponent;
		return this.linspace(a, b, n).map(x => Math.pow(exponent, x));
	}
}