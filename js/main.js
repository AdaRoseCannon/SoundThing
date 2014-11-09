/* jshint browser:true */
/* globals Detector, THREE, AudioContext, Hammer, Promise */
'use strict';


/**
 * Local Vars
 */
var began = false;
var analyser; // Audio analyser object
var maxBins = 128; // Reduce freq resolution
var cutOff = 0.5; // Only draw the bottom half of the spectrum.
var mediaStreamSource; // The audio input object

var sumData; // Sum of audio ampitude
var count = 0; //Number of audio frames read.

var container;
var camera, scene, renderer, renderMethod;
var mesh, geometry, geometry0;

var xRotOffset = 0;
var yRotOffset = 0;

var tempScale = 1;
var meshScale = tempScale;

var WIDTH = document.documentElement.clientWidth;
var HEIGHT = WIDTH * document.documentElement.clientHeight / document.documentElement.clientWidth;

/**
 * Normalise Features
 */

(function normalizeFeatures() {
	window.requestAnimFrame = (function() {
		return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || function(callback) {
			window.setTimeout(callback, 1000 / 60);
		};
	})();
	window.AudioContext = window.AudioContext || window.webkitAudioContext;
	navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
})();

/**
 * Add Event Listners
 */

window.addEventListener('load', init, false);

function addScript(url) {
	return new Promise(function (resolve, reject) {
		var script = document.createElement('script');
		script.setAttribute('src', url);
		document.head.appendChild(script);
		script.onload = resolve;
		script.onerror = reject;
	});
}

function initThreeJS() {
	return addScript('js/three.min.js').then(function () {
		container = document.body;

		camera = new THREE.PerspectiveCamera(90, WIDTH / HEIGHT, 1, 1500);
		camera.position.z = 1000;

		scene = new THREE.Scene();
		scene.fog = new THREE.Fog(0x050505, 2000, 3500);

		scene.add(new THREE.AmbientLight(0x444444));

		var light1 = new THREE.DirectionalLight(0xffffff, 0.5);
		light1.position.set(1, 1, 1);
		scene.add(light1);

		var light2 = new THREE.DirectionalLight(0xffffff, 1.5);
		light2.position.set(0, -1, 0);
		scene.add(light2);

		var loader = new THREE.JSONLoader();

		renderer = new THREE.WebGLRenderer({
			antialias: false
		});
		renderer.setClearColor(scene.fog.color, 1);
		renderer.setSize(WIDTH, HEIGHT);

		renderer.gammaInput = true;
		renderer.gammaOutput = true;
		container.appendChild(renderer.domElement);
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';

		renderMethod = renderer;
		window.addEventListener('resize', resizeToWindow, false);

		return new Promise(function (resolve) {
			loader.load("js/bunny.js", function(geom) {
				geometry = geom;
				geometry0 = geom.clone();
				mesh = new THREE.Mesh(geom, new THREE.MeshNormalMaterial());
				mesh.scale.set(100, 100, 100);
				scene.add(mesh);
				resolve();
			});
		});
	});
}

function resizeToWindow() {

	WIDTH = document.documentElement.clientWidth;
	HEIGHT = WIDTH * document.documentElement.clientHeight / document.documentElement.clientWidth;

	camera.aspect = WIDTH / HEIGHT;
	camera.updateProjectionMatrix();

	renderer.setSize(WIDTH, HEIGHT);
	if (renderMethod !== renderer) renderMethod.setSize(WIDTH, HEIGHT);
}

function initTouch() {
	addScript('js/hammer.min.js').then (function () {
		var hammertime = new Hammer(renderer.domElement);
		hammertime.get('pinch').set({
			enable: true
		});
		hammertime.on('panmove', function(ev) {
			xRotOffset -= ev.velocityY / 10;
			yRotOffset -= ev.velocityX / 10;
		});
		hammertime.on('pinchstart', function() {
			tempScale = meshScale;
		});
		hammertime.on('pinchmove', function(ev) {
			meshScale = tempScale * ev.scale;
		});
	});
}

function initMenu() {
	return new Promise( function (resolve) {
		var ev = window.addEventListener('click', function () {
			fullscreen();
			window.removeEventListener('click', ev);
			resolve('cardboard');
		});
		window.addEventListener('keypress', function () {
			resolve('screen');
		});
	});
}

function initCardboard() {
	return Promise.all([addScript('js/StereoEffect.js'), addScript('js/OrbitControls.js'),  addScript('js/DeviceOrientationControls.js')]).then (function () {

		var clock = new THREE.Clock();

		function setOrientationControls(e) {
			if (!e.alpha) {
				return;
			}
			var controls = new THREE.OrbitControls(camera, renderer.domElement);

			controls.rotateUp(Math.PI / 4);
			controls.target.set(
				camera.position.x + 0.1,
				camera.position.y,
				camera.position.z
			);
			controls.noZoom = true;
			controls.noPan = true;

			controls = new THREE.DeviceOrientationControls(camera, true);
			controls.connect();
			controls.update();

			function controlsLoop() {
				requestAnimationFrame(function() {
					controls.update(clock.getDelta);
					controlsLoop();
				});
			}
			controlsLoop();

			window.removeEventListener('deviceorientation', setOrientationControls);
		}
		window.addEventListener('deviceorientation', setOrientationControls, true);
		render(new THREE.StereoEffect(renderer));
	});
}

function fullscreen () {
	if (container.requestFullscreen) {
		container.requestFullscreen();
	} else if (container.msRequestFullscreen) {
		container.msRequestFullscreen();
	} else if (container.mozRequestFullScreen) {
		container.mozRequestFullScreen();
	} else if (container.webkitRequestFullscreen) {
		container.webkitRequestFullscreen();
	}
}

/**
 * Init
 */
function init() {

	// Feature detect
	if (!Detector.webgl) {
		Detector.addGetWebGLMessage();
		return;
	} else {
		initThreeJS().then(function () {
			render(renderer);
			return initMenu();
		}).then(function (choice) {
			switch (choice) {
				case 'screen':
					initTouch();
					break;
				case 'cardboard':
					initCardboard().then(function () {
						console.log('cardboard render');
					}).catch(function (e) {
						console.log (e.stack);
					});
					break;
			}

			console.log ('Getting data');
			beginBunny();
		});
	}

	// Get the audio Source
	navigator.getUserMedia({
		audio: true
	}, function gotStream(stream) {

		var audioContext = new AudioContext();
		analyser = audioContext.createAnalyser();
		analyser.fftSize = maxBins * 2;

		// Create an AudioNode from the stream.
		mediaStreamSource = audioContext.createMediaStreamSource(stream);
		mediaStreamSource.connect(analyser);
		sumData = new Float32Array(analyser.frequencyBinCount);

	}, function(err) {
		console.log(err);
	});
}

function beginBunny() {
	if (began) return;
	began = true;
	var data;

	function audioDataLoop() {
		requestAnimationFrame(function() {
			data = getAudioData();
			audioDataLoop();
		});
	}

	function geomLoop() {
		requestAnimationFrame(function() {
			if (data) updateGeom(data);
			geomLoop();
		});
	}

	audioDataLoop();
	geomLoop();
}

function getAudioData() {
	if (!analyser) return;
	var freqData = new Float32Array(analyser.frequencyBinCount);
	var min = analyser.minDecibels;
	var max = analyser.maxDecibels;
	analyser.getFloatFrequencyData(freqData);
	var out = [];
	count++;
	for (var i = 1; i < freqData.length * cutOff; i++) {
		sumData[i] += freqData[i];
		var average = sumData[i] / count;
		out.push(100 * (freqData[i] - average) / (max - min));
	}
	return out;
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

function scaleSphere(p, t, array) {
	var scale0 = 1 + array[0] / 6;
	var l = array.length;
	for (var i = 1; i < l; i++) {
		scale0 += 2 * ((array[i] * i / (l * l)) * Math.sin(i * i * Math.PI * p / l) + (array[i] * i / (l * l)) * Math.cos(i * i * Math.PI * t / l));
	}
	return 1 + scale0 * 0.1;
}

function updateGeom(data) {

	if (!geometry) return;

	var nVert = geometry.vertices.length;

	for (var i = 0; i < nVert; i += 1) {
		var sph = convertCartesianToSpherical(geometry0.vertices[i]);
		var scale = scaleSphere(sph.p, sph.t, data);
		geometry.vertices[i].x = geometry0.vertices[i].x * scale;
		geometry.vertices[i].y = geometry0.vertices[i].y * scale;
		geometry.vertices[i].z = geometry0.vertices[i].z * scale;
	}

	geometry.dynamic = true;
	geometry.verticesNeedUpdate = true;
}

var renderingStarted = false;
function render(rm) {
	if (rm) renderMethod = rm;
	if (renderingStarted) return;
	requestAnimationFrame(function() {
		if (!mesh) return;
		var time = Date.now() * 0.001;
		mesh.scale.set(100 * meshScale, 100 * meshScale, 100 * meshScale);
		mesh.rotation.x = time * 0.25 + xRotOffset;
		mesh.rotation.y = time * 0.5 + yRotOffset;
		renderMethod.render(scene, camera);
		render();
	});
}