/* jshint browser:true */
/* globals Detector, THREE, AudioContext, Hammer, Promise */
'use strict';


/**
 * Local Vars
 */
var analyser; // Audio analyser object
var maxBins = 32; // Reduce freq resolution
var cutOff = 0.5; // Only draw the bottom half of the spectrum.
var mediaStreamSource; // The audio input object

var container, mesh;
var camera, scene, renderer, renderMethod, stereoEffect;

var xRotOffset = 0;
var yRotOffset = 0;

var WIDTH = document.documentElement.clientWidth;
var HEIGHT = WIDTH * document.documentElement.clientHeight / document.documentElement.clientWidth;

var audioBins = Array.apply(null, new Array(maxBins)).map(function() { return 0.01 });

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

		camera = new THREE.PerspectiveCamera(90, WIDTH / HEIGHT, 0.01, 20);
		camera.position.z = 2;

		scene = new THREE.Scene();

		var light2 = new THREE.DirectionalLight(0xffffff, 0.5);
		light2.position.set(0, 8, 0);
		light2.lookAt(new THREE.Vector3(0, 0, 0));
		scene.add(light2);

		var loader = new THREE.JSONLoader();

		renderer = new THREE.WebGLRenderer({
			antialias: false
		});

		renderer.setSize(WIDTH, HEIGHT);
		container.appendChild(renderer.domElement);
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';

		renderMethod = renderer;
		window.addEventListener('resize', resizeToWindow, false);

		return new Promise(function (resolve) {
			loader.load("js/bunny.json", function(geom) {

				var path = "images/";
				var format = '.jpg';
				var urls = [
					path + 'px' + format, path + 'nx' + format,
					path + 'py' + format, path + 'ny' + format,
					path + 'pz' + format, path + 'nz' + format
				];
				var reflectionCube = THREE.ImageUtils.loadTextureCube(urls);
				reflectionCube.format = THREE.RGBFormat;
				var shiny = new THREE.MeshLambertMaterial({ 
					color: 0xaa0000,
					specular: 0x440000,
					envMap: reflectionCube,
					combine: THREE.MixOperation,
					reflectivity: 0.3,
					metal: true
				});
				window.shiny = shiny;

				var mat = new THREE.ShaderMaterial({
					uniforms: {
						audioBins: {
							type: "fv1",
							value: audioBins
						}
					},
					attributes: {},
					vertexShader: document.getElementById('vertShader').text,
					fragmentShader: document.getElementById('fragShader').text
				});
				
				mesh = new THREE.Mesh(geom, mat);
				scene.add(mesh);
				resolve();
			});
		});
	});
}

var renderingStarted = false;
function render(rm) {
	if (rm) renderMethod = rm;
	if (!renderingStarted) {
		renderLoop();
		renderingStarted = true;
	}
}

function renderLoop() {
	if (!mesh) return;
	var time = Date.now() * 0.001;
	getAudioData();
	mesh.rotation.x = time * 0.25 + xRotOffset;
	mesh.rotation.y = time * 0.5 + yRotOffset;
	renderMethod.render(scene, camera);
	requestAnimationFrame(renderLoop);
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
		// hammertime.on('pinchstart', function() {
		// 	tempScale = meshScale;
		// });
		// hammertime.on('pinchmove', function(ev) {
		// 	meshScale = tempScale * ev.scale;
		// });
	});
}

function initMenu() {
	document.querySelector('.overlay').style.display = 'block';
	var cardboard = document.querySelector('.overlay-item.cardboard');
	var computer = document.querySelector('.overlay-item.computer');
	var el1, el2;
	return new Promise( function (resolve) {
		cardboard.addEventListener('click', el1 = function () {
			fullscreen();
			resolve('cardboard');
		}, false);
		computer.addEventListener('click', el2 = function () {
			resolve('screen');
			window.addEventListener('doubleclick', fullscreen);
		});
	}).then(function (choice) {
		cardboard.removeEventListener('click', el1);
		computer.removeEventListener('click', el2);
		document.querySelector('.overlay').style.display = 'none';
		return choice;
	});
}

function initCardboard() {
	return Promise.all([addScript('js/StereoEffect.js'),  addScript('js/DeviceOrientationControls.js')]).then (function () {

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

	}, function(err) {
		console.log(err);
	});
}

function getAudioData() {
	if (!analyser) return audioBins;
	var freqData = new Float32Array(analyser.frequencyBinCount);
	var min = analyser.minDecibels;
	var max = analyser.maxDecibels;
	analyser.getFloatFrequencyData(freqData);
	for (var i = 1; i < freqData.length * cutOff; i++) {
		audioBins[i] = (50 * (freqData[i] - min) / (max - min));
	}
	return audioBins;
}
