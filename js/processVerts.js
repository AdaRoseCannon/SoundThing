/* jshint worker:true */
'use strict';

var previousAudioData;
var sumOfSquareDeviations;
var currentAudioData;
var count = 0;
var geometry0;
var geometry;

function averageAudioChannel(i) {
	if (count) {
		return previousAudioData[i]/count;
	} else {
		return 0;
	}
}

function standardDeviation(i) {
	if (count > 2) {
		return Math.sqrt(sumOfSquareDeviations[i]/(count -1));
	} else {
		return 0;
	}
}

function convertCartesianToSpherical(cartesian) {

	var r = Math.sqrt(cartesian.x * cartesian.x + cartesian.y * cartesian.y + cartesian.z * cartesian.z);
	var lat = Math.asin(cartesian.z / r);
	var lon = Math.atan2(cartesian.y, cartesian.x);
	return {
		p: lat,
		t: lon,
		r: r
	};
}

var fc = 0;
function scaleSphere(p, t, array) {
	var scale = 0;
	var l = array.length;
	for (var i = 0; i < l; i++) {
		var amplitude = (array[i] - averageAudioChannel(i)) / standardDeviation(i);
		scale += amplitude/(l * Math.log(i + 2)) * (Math.sin(i * i * Math.PI * p / l) + Math.cos(i * i * Math.PI * t / l));
	}
	if (Math.random() < 0.00001) fc = (fc + 1) % l;
	return 1 + scale;
}

function updateGeom() {

	if (!geometry0) return;
	if (!currentAudioData) return;

	var nVert = geometry0.vertices.length;

	if (!geometry) {
		(function generateFreshGeomtryStruct() {
			geometry = {
				vertices: []
			};
			for (var i = 0; i < nVert; i += 1) {
				geometry.vertices[i] = {};
			}
		})();
	}

	for (var i = 0; i < nVert; i += 1) {
		var sph = convertCartesianToSpherical(geometry0.vertices[i]);
		var scale = scaleSphere(sph.p, sph.t, currentAudioData);
		geometry.vertices[i].x = geometry0.vertices[i].x * scale;
		geometry.vertices[i].y = geometry0.vertices[i].y * scale;
		geometry.vertices[i].z = geometry0.vertices[i].z * scale;
	}
}

function log(str) {
	self.postMessage({
		cmd: 'log',
		data: str
	});
}

function updateAudioData(d) {
	var l = d.length;
	for (var i = 0; i < l; i += 1) {
		currentAudioData[i] = parseFloat(d[i]);
		previousAudioData[i] = (previousAudioData[i] || 0) + currentAudioData[i];
		sumOfSquareDeviations[i] = (sumOfSquareDeviations[i] || 0) + Math.pow(currentAudioData[i] - averageAudioChannel(i), 2);
	}
	count++;
}

self.addEventListener('message', function(e) {
	var data = e.data;
	switch (data.cmd) {
		case 'updateGeom':
			geometry0 = {};
			geometry0.vertices = data.vertices;
			updateGeom();
			log ('geometry loaded in worker');
			break;
		case 'updateAudioData':
			updateAudioData(data.audioData);
			break;
		case 'fetchVertices':
			if (geometry) self.postMessage({cmd: 'newVertices', vertices: geometry.vertices});
			updateGeom();
			break;
		case 'init': {
			previousAudioData = new Float32Array(data.frequencyBinCount);
			sumOfSquareDeviations = new Float32Array(data.frequencyBinCount);
			currentAudioData = new Float32Array(data.frequencyBinCount);
			break;
		}
	}
}, false);