/* jshint browser:true */
/* globals Detector, THREE, AudioContext, Hammer, Promise */
'use strict';


/**
 * Local Vars
 */
var began = false;
var analyser; // Audio analyser object
var maxBins = 32; // Reduce freq resolution
var cutOff = 0.5; // Only draw the bottom half of the spectrum.
var mediaStreamSource; // The audio input object

var sumData; // Sum of audio ampitude
var count = 0; //Number of audio frames read.

var container;
var camera, scene, renderer, renderMethod, stereoEffect;
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
		camera.position.z = 1300;

		scene = new THREE.Scene();

		var lightGreen = new THREE.DirectionalLight(0xffff00, 0.5);
		lightGreen.position.set(-100, -100, 0);
		scene.add(lightGreen);

		var lightRed = new THREE.DirectionalLight(0xff00ff, 0.5);
		lightRed.position.set(100, 0, 0);
		scene.add(lightRed);

		var lightCyan = new THREE.DirectionalLight(0x00ffff, 0.5);
		lightCyan.position.set(0, 100, 100);
		scene.add(lightCyan);

		var light2 = new THREE.DirectionalLight(0xffffff, 0.5);
		light2.position.set(0, 2000, 0);
		light2.castShadow = true;
		light2.shadowDarkness = 0.5;
		light2.shadowCameraTop = 800;
		light2.shadowCameraBottom = -800;
		light2.shadowCameraLeft = -800;
		light2.shadowCameraRight = 800;
		scene.add(light2);

		var loader = new THREE.JSONLoader();

		renderer = new THREE.WebGLRenderer({
			antialias: false
		});

		renderer.setSize(WIDTH, HEIGHT);
		renderer.shadowMapEnabled = true;
		container.appendChild(renderer.domElement);
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';

		renderMethod = renderer;
		window.addEventListener('resize', resizeToWindow, false);

		var floorTexture = THREE.ImageUtils.loadTexture('images/checker.png');
		floorTexture.wrapS = THREE.RepeatWrapping;
		floorTexture.wrapT = THREE.RepeatWrapping;
		floorTexture.repeat = new THREE.Vector2(50, 50);
		floorTexture.anisotropy = renderer.getMaxAnisotropy();

		var floorMaterial = new THREE.MeshLambertMaterial({
			color: 0xffffff,
			specular: 0xffffff,
			shininess: 20,
			shading: THREE.FlatShading,
			map: floorTexture
		});

		var floorGeometry = new THREE.PlaneGeometry(10000, 10000);

		var floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
		floorMesh.rotation.x = -Math.PI / 2;
		floorMesh.position.y = -500;
		floorMesh.position.z = -500;
		scene.add(floorMesh);

		return new Promise(function (resolve) {
			loader.load("js/bunny.js", function(geom) {
				geometry = geom;
				geometry0 = geom.clone();
				mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({
					color: 0xffffff,
					specular: 0xffffff,
					shininess: 20,
					shading: THREE.FlatShading
				}));
				mesh.scale.set(100, 100, 100);
				scene.add(mesh);
				mesh.castShadow = true;
				floorMesh.receiveShadow = true;
				light2.lookAt(mesh);
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
	if (stereoEffect) stereoEffect.setSize(WIDTH, HEIGHT);
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
	document.querySelector('.overlay').style.display = 'block';
	var cardboard = document.querySelector('.overlay-item.cardboard');
	var computer = document.querySelector('.overlay-item.computer');
	return new Promise( function (resolve) {
		cardboard.addEventListener('click', function () {
			fullscreen();
			resolve('cardboard');
		}, false);
		computer.addEventListener('click', function () {
			resolve('screen');
			window.addEventListener('doubleclick', fullscreen);
		});
	}).then(function (choice) {
		cardboard.removeEventListener('click');
		computer.removeEventListener('click');
		document.querySelector('.overlay').style.display = 'none';
		return choice;
	});
}

function initCardboard() {
	return Promise.all([addScript('js/StereoEffect.js'), addScript('js/OrbitControls.js'),  addScript('js/DeviceOrientationControls.js')]).then (function () {

		function setOrientationControls(e) {
			if (!e.alpha) {
				return;
			}

			var clock = new THREE.Clock();

			var controls = new THREE.DeviceOrientationControls(camera, true);
			controls.connect();
			controls.update();

			(function controlsLoop() {
				requestAnimationFrame(function() {
					controls.update(clock.getDelta);
					camera.updateProjectionMatrix();
					controlsLoop();
				});
			})();

			window.removeEventListener('deviceorientation', setOrientationControls, true);
		}
		window.addEventListener('deviceorientation', setOrientationControls, true);
		stereoEffect = new THREE.StereoEffect(renderer);
		render(stereoEffect);
		resizeToWindow();
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
			Promise.resolve().then(function () {
				switch (choice) {
					case 'screen':
						return initTouch();
					case 'cardboard':
						return initCardboard().catch(function (e) {
							console.log (e.stack);
						});
				}
			}).then (function () {
				beginBunny();
			});
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

	function geomLoop() {
		requestAnimationFrame(function() {
			var data = getAudioData();
			if (data) updateGeom(data);
			geomLoop();
		});
	}

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
		out.push(50 * (freqData[i] - average) / (max - min));
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