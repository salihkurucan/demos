var DataGridLayer = L.Layer.extend({

    initialize: function(options) {
        this.renderer = options.renderer;
        this.colorScale = options.colorScale || d3.scale.linear().range(['yellow', 'red']);
        this.data = null;
    },

    onAdd: function(map) {
        this._map = map;

        this._el = L.DomUtil.create('canvas', 'data-grid-layer leaflet-zoom-hide');
        map.getPanes().overlayPane.appendChild(this._el);

        map.on('viewreset', this._reset, this);
        map.on('moveend', this._reset, this);
        map.on('resize', this._reset, this);
    },

    onRemove: function(map) {
        map.getPanes().overlayPane.removeChild(this._el);
        map.off('moveend', this._reset, this);
        map.off('dragend', this._reset, this);
        map.off('resize', this._reset, this);
    },

    _reset: function(e) {
        var pos = this._map._getMapPanePos();
        this._el.style.transform = 'translate(' + (-pos.x) + 'px,' + (-pos.y) + 'px)';
        this.render();
    },

    render: function() {
        var mapBounds = this._map.getBounds();
        var mapSize = this._map.getSize();
        if (!this.data) {
            return this;
        }
        var lat = this.data.lat;
        var lon = this.data.lon;
        var values = this.data.values;

        var canvas = this._el;
        canvas.width = mapSize.x;
        canvas.height = mapSize.y;

        var ctx = canvas.getContext('2d');
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, mapSize.x, mapSize.y);

        var northIndex = utils.bisectionReversed(lat, mapBounds.getNorth());
        var southIndex = utils.bisectionReversed(lat, mapBounds.getSouth());
        var westIndex = utils.bisection(lon, mapBounds.getWest());
        var eastIndex = utils.bisection(lon, mapBounds.getEast());

        // var colorScale = equalizeBrewerSpectral(flattenAndUniquify(values).flattened);
        // var magnitudeExtent = flattenAndUniquify(values, function(d){ return d.magnitude; }).flattened;

        // this.colorScale.domain(colorScaleDomain || [0, 1]);

        ctx.globalAlpha = 1;

        var skip = Math.ceil((eastIndex - westIndex - 1) / mapSize.x * 2);

        var northWestPoint = this._map.latLngToContainerPoint(L.latLng(lat[northIndex], lon[Math.max(westIndex, 0)]));
        var northWestPointNextLon = this._map.latLngToContainerPoint(L.latLng(lat[northIndex], lon[Math.min(westIndex + skip, lon.length - 1)]));

        var w = Math.max(northWestPointNextLon.x - northWestPoint.x, 1) + 2;

        var point, value, latIndex, nextLatIndex, lonIndex, nextLongIndex;
        for (var i = northIndex - 1; i < southIndex; i += skip) {
            latIndex = Math.max(i, 0);
            nextLatIndex = Math.min(latIndex + 1, lat.length - 1);

            var firstPointAtCurrentLat = this._map.latLngToContainerPoint(L.latLng(lat[latIndex], lon[westIndex]));
            var firstPointAtNextLat = this._map.latLngToContainerPoint(L.latLng(lat[nextLatIndex], lon[westIndex]));

            var h = Math.ceil(Math.max(firstPointAtNextLat.y - firstPointAtCurrentLat.y, 1) + 2);

            for (var j = westIndex - 1; j < eastIndex; j += skip) {
                lonIndex = Math.max(j, 0);
                point = this._map.latLngToContainerPoint(L.latLng(lat[latIndex], lon[lonIndex]));
                value = values[latIndex][lonIndex];

                if (value !== -999 && value !== null && !isNaN(value) && i % 1 === 0 && j % 1 === 0) {
                    var info = {
                        centerX: point.x,
                        centerY: point.y,
                        width: w,
                        height: h,
                        value: value,
                        data: this.data,
                        columnIndex: i,
                        rowIndex: j,
                        lonIndex: lonIndex,
                        latIndex: latIndex,
                        longitude: lon[lonIndex],
                        latitude: lat[latIndex],
                        colorScale: this.colorScale
                    };

                    this.renderer(ctx, info);
                }
            }
        }

        return this;
    },

    setColorScale: function(colorScale) {
        this.colorScale = colorScale;
        return this;
    },

    setData: function(d) {
        this.data = d;
        return this;
    },

    setRenderer: function(renderer) {
        this.renderer = renderer;
        return this;
    }

});

var DataMarkerLayer = DataGridLayer.extend({

    render: function() {
        var mapBounds = map.getBounds();
        var mapSize = map.getSize();
        if (!this.data) {
            return this;
        }
        var lat = this.data.lat;
        var lon = this.data.lon;
        var values = this.data.values;

        var canvas = this._el;
        canvas.width = mapSize.x;
        canvas.height = mapSize.y;

        var ctx = this._el.getContext('2d');
        ctx.globalAlpha = 1;

        var data = this.data;
        if (!data) {
            return this;
        }

        /*
            TODO:
            -filter for coords in view
        */

        var point, dataPoint, info;
        for (var i = 0; i < data.length; i++) {
            dataPoint = data[i];
            point = map.latLngToContainerPoint(L.latLng(dataPoint.lat, dataPoint.lon));

            info = {
                data: data[i],
                centerX: point.x,
                centerY: point.y
            };

            this.renderer(ctx, info);
        }
        return this;
    }

});

function getQuantiles(values, buckets) {
    return d3.scale.quantile().domain(values).range(d3.range(buckets)).quantiles();
};

function equalizeBrewerSpectral(values) {
    var brewerSpectral = ["#5e4fa2", "#3288bd", "#66c2a5", "#abdda4", "#e6f598", "#ffffbf", "#fee08b", "#fdae61", "#f46d43", "#d53e4f", "#9e0142"];
    var quantiles = getQuantiles(values, brewerSpectral.length - 1);
    quantiles.push(utils.findMax(values));
    quantiles.unshift(utils.findMin(values));
    return d3.scale.linear().domain(quantiles).range(brewerSpectral);
}

var mapWrapper = function(_config) {

    var config = {
        el: _config.el,
        colorScale: _config.colorScale
    };

    var events = {
        click: utils.reactiveProperty(),
        mousemove: utils.reactiveProperty(),
        mouseenter: utils.reactiveProperty(),
        mouseleave: utils.reactiveProperty(),
        featureClicked: utils.reactiveProperty(),
        featureMousEnter: utils.reactiveProperty(),
        featureMousLeave: utils.reactiveProperty()
    }

    var states = {
        isVisible: true
    }

    var map, gridLayer, markerLayer, geojsonLayer, marker, gridData, cachedBBoxPolygon;

    var rectMarkRenderer = function(ctx, info) {
        ctx.beginPath();
        ctx.fillStyle = info.colorScale(info.value);
        ctx.rect(info.centerX, info.centerY - info.height / 2, info.width, info.height);
        ctx.fill();
    };

    var markerRenderer = function(ctx, info) {
        var radius = info.data.GeneratingCapacity / info.data.capacityMinMax[1] * 30 + 2;
        // var radius = info.data.magnitude / info.data.magnitudeMinMax[1] * 15 + 2;
        var color = ~~(info.data.magnitude / info.data.magnitudeMinMax[1] * 255);
        ctx.beginPath();
        ctx.fillStyle = '#0fa20b';
        // ctx.fillStyle = 'rgb('+0+', '+(255-color)+', '+color+')';
        ctx.globalAlpha = 0.7;
        ctx.arc(info.centerX, info.centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
    };

    function init() {
        var southWest = L.latLng(-90, -180);
        var northEast = L.latLng(90, 180);
        var bounds = L.latLngBounds(southWest, northEast);

        var containerWidth = config.el.getBoundingClientRect().width;

        map = L.map(config.el, {
                // crs: L.CRS.Simple,
                maxBounds: bounds,
                maxZoom: 12,
                minZoom: 0,
                scrollWheelZoom: false,
                zoomSnap: 0,
                zoomDelta: 1,
                attributionControl: false,
                tileLayer: {
                    noWrap: true,
                    continuousWorld: false
                }
            })
            .fitWorld()
            // .setView([30, 0], 7)
            .on('click', function(e) {
                events.click({ lat: e.latlng.lat, lon: e.latlng.lng });
            })
            .on('mousedown', function(e) { config.el.classList.add('grab'); })
            .on('mouseup', function(e) { config.el.classList.remove('grab'); })
            .on('mousemove', function(e) {
                if (gridData) {
                    var latIndex = utils.bisectionReversed(gridData.lat, e.latlng.lat);
                    var lonIndex = utils.bisection(gridData.lon, e.latlng.lng);
                    events.mousemove({
                        x: e.containerPoint.x,
                        y: e.containerPoint.y,
                        value: gridData.values[latIndex][lonIndex],
                        lat: e.latlng.lat,
                        lon: e.latlng.lng
                    });
                }
            })
            .on('mouseover', function(e) {
                events.mouseenter(e);
            })
            .on('mouseout', function(e) {
                events.mouseleave(e);
            })

        gridLayer = new DataGridLayer({
            renderer: rectMarkRenderer
        });

        markerLayer = new DataMarkerLayer({
            renderer: markerRenderer
        });

        map.addLayer(gridLayer);

        // map.addLayer(markerLayer);
        // marker = L.marker([0, 0], {
        //         interactive: true,
        //         draggable: true,
        //         title: 'Set the location of the point query example',
        //         opacity: 0
        //     })
        //     .addTo(map);
        return this;
    }

    function render() {

        return this;
    }

    function show() {
        config.el.style.display = 'block';
        states.isVisible = true;
        return this;
    }

    function hide() {
        config.el.style.display = 'none';
        states.isVisible = false;
        return this;
    }

    function resize() {
        var containerWidth = config.el.getBoundingClientRect().width;

        if (cachedBBoxPolygon) {
            zoomToPolygonBoundingBox(cachedBBoxPolygon);
        } else {
            map.fitWorld();
        }
        return this;
    }

    function zoomToPolygonBoundingBox(polygon) {
        var bboxGeojsonLayer = L.geoJson(polygon);
        map.fitBounds(bboxGeojsonLayer.getBounds());
        cachedBBoxPolygon = polygon;
        return this;
    }

    function zoomToBoundingBox(bbox) {
        map.fitBounds(bbox);
        cachedBBoxPolygon = polygon;
        return this;
    }

    function renderPolygon(polygon, options) {
        var options = options || {};

        function getFeatureData(feature, latlng) {
            var coords = feature.geometry.coordinates.slice();
            var coordsSorted = coords.sort(function(a, b) {
                return a[1] - b[1];
            }); //lon-lat
            var coordsLat = coordsSorted.map(function(d, i) {
                return d[1];
            });

            var latIndex = utils.bisection(coordsLat, latlng.lat);
            return coordsSorted[latIndex][2]
        }

        var onEachFeature = function(feature, layer) {
            layer.on({
                click: function(e) {
                    var lat = e.target._latlng ? e.target._latlng.lat : e.latlng.lat;
                    var lon = e.target._latlng ? e.target._latlng.lng : e.latlng.lng;

                    events.featureClicked({
                        id: e.target.feature.properties.id,
                        lat: lat,
                        lon: lon,
                        layer: e
                    });
                },
                mouseover: function(e, a, b) {
                    events.featureMousEnter({
                        x: e.containerPoint.x,
                        y: e.containerPoint.y,
                        lat: e.latlng.lat,
                        lon: e.latlng.lng,
                        value: e.target.feature.properties.id
                    });
                },
                mouseout: function(e) {
                    events.featureMousLeave({
                        x: e.containerPoint.x,
                        y: e.containerPoint.y,
                        lat: e.latlng.lat,
                        lon: e.latlng.lng,
                        value: e.target.feature.properties.id
                    });
                }
            });
        }

        var radius = options.radius || 30;

        var icon = L.icon({
            iconUrl: options.icon || './turbine_icon3.png',
            iconSize: [radius * 0.8, radius],
            iconAnchor: [radius / 2, radius / 2],
            popupAnchor: [-3, -76]
        });

        geojsonLayer = L.geoJson(polygon, {
                onEachFeature: onEachFeature,
                pointToLayer: function(feature, latlng) {
                    if (options.useIcon) {
                        var marker = new L.marker(latlng, { icon: icon });
                        return marker;
                    } 
                    else if (options.useLabels) {
                        var featureData = getFeatureData(feature, latlng);
                        var label = L.divIcon({
                            className: 'feature-label', 
                            html: '<div><div class="label">' + featureData.originalData.Name 
                                + '</div><div class="dot">.</div></div>',
                            iconSize: [300, 20]
                        })
                        var marker = new L.marker(latlng, { icon: label });
                        return marker;
                    }
                    else {
                        return new L.CircleMarker(latlng, {
                            radius: options.radius || 4,
                            fillColor: options.fillColor || '#05A5DE',
                            color: '#1E1E1E',
                            weight: 1,
                            opacity: 0.5,
                            fillOpacity: 0.4
                        });
                    }
                }
            })
            .addTo(map);

        // map.fitBounds(geojsonLayer.getBounds());
        return this;
    }

    function renderMarker(coordinates) {
        marker.setLatLng(L.latLng(coordinates[0], coordinates[1]))
            .setOpacity(1);
        return this;
    }

    function renderRaster(data) {
        gridData = data;
        gridLayer.setColorScale(equalizeBrewerSpectral(data.uniqueValues.sort(function(a, b) {
                return a - b;
            })))
            .setData(data)
            .render();
        return this;
    }

    function renderBasemap() {
        var basemap = L.tileLayer('http://server.arcgisonline.com/ArcGIS/rest/services/Ocean_Basemap/MapServer/tile/{z}/{y}/{x}', {
            attribution: '',
            maxZoom: 13
        });

        // var basemap = L.tileLayer('https://api.mapbox.com/styles/v1/chrisviau/ciqw5m3eg000gcbmblv8cyjyq/tiles/256/{z}/{x}/{y}?access_token=pk.eyJ1IjoiY2hyaXN2aWF1IiwiYSI6ImFERnVTeXcifQ.Eun4jtPE8upbuP2uKawtFw', {
        //     attribution: '',
        //     subdomains: 'abcd',
        //     id: '<your id>'
        // });


        map.addLayer(basemap);
        return this;
    }

    function renderLineMap() {
        var countriesOverlay = L.d3SvgOverlay(function(sel, proj) {
            var upd = sel.selectAll('path.countries').data(countries);
            upd.enter()
                .append('path')
                .attr({
                    'class': 'countries',
                    d: proj.pathFromGeojson,
                    fill: 'transparent'
                });

            upd.attr('stroke-width', 1 / proj.scale);
        });

        countries = worldMapCountries.features;
        countriesOverlay.addTo(map)
        return this;
    }

    function hideZoomControl(bool) {
        if (bool) {
            map.addControl(map.zoomControl);
            map.doubleClickZoom.enable();
            map.boxZoom.enable();
            map.dragging.enable();
        } else {
            map.removeControl(map.zoomControl);
            map.doubleClickZoom.disable();
            map.boxZoom.disable();
            map.dragging.disable();
        }
        return this;
    }

    return {
        init: init,
        render: render,
        show: show,
        hide: hide,
        resize: resize,
        zoomToPolygonBoundingBox: zoomToPolygonBoundingBox,
        zoomToBoundingBox: zoomToBoundingBox,
        renderMarker: renderMarker,
        renderPolygon: renderPolygon,
        renderBasemap: renderBasemap,
        renderLineMap: renderLineMap,
        events: events,
        renderRaster: renderRaster,
        isVisible: states.isVisible,
        hideZoomControl: hideZoomControl
    };
}