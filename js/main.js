/* jshint browser:true */
/* globals Detector, THREE, AudioContext, Hammer, Promise, DeviceOrientationController */
'use strict';


/**
 * Local Vars
 */
var analyser; // Audio analyser object
var mediaStreamSource; // The audio input object
var maxBins = 32; // Reduce freq resolution

var container, mesh;
var camera, scene, renderer, renderMethod, stereoEffect, deviceOrientationController;
var dataForVertexShader = Array.apply(null, new Array(maxBins)).map(function() { return 0.0 });

var xRotOffset = 0;
var yRotOffset = 0;

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
	return addScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r73/three.min.js')
	.then(() => {
		return Promise.all([
			addScript('https://cdn.rawgit.com/mrdoob/three.js/master/examples/js/effects/StereoEffect.js'),
			addScript('https://cdn.rawgit.com/richtr/threeVR/master/js/DeviceOrientationController.js')
		]);
	})
	.then(function () {

		container = document.body;

		renderer = new THREE.WebGLRenderer( { antialias: false } );
		renderer.setPixelRatio( window.devicePixelRatio );
		container.appendChild(renderer.domElement);
		renderMethod = renderer;
		renderer.setSize(WIDTH, HEIGHT);
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';



		/**
		 * Init camera
		 */
		camera = new THREE.PerspectiveCamera(75, WIDTH / HEIGHT, 0.01, 20);
		camera.position.z = 3;


		if (location.search === '?vr') {

			/**
			 * Set up stereo effect renderer
			 */

			const effect = new THREE.StereoEffect(renderer);
			effect.eyeSeparation = 0.008;
			effect.focalLength = 0.25;
			effect.setSize( window.innerWidth, window.innerHeight );
			renderMethod = effect;


			/**
			 * Set up head tracking
			 */

			 // provide dummy element to prevent touch/click hijacking.
			const element = location.hostname !== 'localhost' ? document.createElement("DIV") : undefined;
			deviceOrientationController = new DeviceOrientationController(camera, element);
			deviceOrientationController.useQuaternions = false;
			deviceOrientationController.connect();

		}

		scene = new THREE.Scene();
		var loader = new THREE.JSONLoader();
		window.addEventListener('resize', resizeToWindow, false);

		return new Promise(function (resolve) {
			loader.load("js/bunny.json", function(geom) {

				var mat = new THREE.ShaderMaterial({
					uniforms: {
						audioBins: {
							type: "fv1",
							value: dataForVertexShader
						}
					},
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
function render() {
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
	if (deviceOrientationController) {
		deviceOrientationController.update();
	}
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
			render();
			return Promise.resolve('screen');//initMenu();
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

// Scope getAudioDate to keep audio vars nearby
var getAudioData = (function () {

	var cutOff = 1.0;
	var count = 0;

	var audioBins = dataForVertexShader.slice();
	var audioBinsSum = dataForVertexShader.slice();
	var audioBinsSumOfVarience = dataForVertexShader.slice();

	function getAudioData() {
		if (!analyser) return audioBins;
		var freqData = new Float32Array(analyser.frequencyBinCount);
		var min = analyser.minDecibels;
		var max = analyser.maxDecibels;

		analyser.getFloatFrequencyData(freqData);

		for (var i = 1; i < freqData.length * cutOff; i++) {
			audioBins[i] = (50 * (freqData[i] - min) / (max - min));
		}
		audioBinsSum.forEach(function (a, i) {
			audioBinsSum[i] = a + audioBins[i];
		});
		audioBinsSumOfVarience.forEach(function (a, i) {
			if (!count) return;
			audioBinsSumOfVarience[i] = a + Math.pow((audioBinsSum[i]/count) - audioBins[i], 2);

			// The data we want to represent is the difference of the current noise from the average/standard deviation
			dataForVertexShader[i] = a ? Math.sqrt(Math.pow((audioBinsSum[i]/count) - audioBins[i], 2)/(a/count)) : 0;
		});
		count++;

	}
	return getAudioData;
})();
