importScripts('/holistic.js');
importScripts(
	'https://cdn.jsdelivr.net/gh/nicolaspanel/numjs@0.15.1/dist/numjs.min.js',
);
importScripts(
	'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@2.8.2/dist/tf.min.js',
);

const findMax = (data) => {
	let max = -Infinity;
	let index = -1;
	let count = 0;
	for (const d of data) {
		if (d > max) {
			max = d;
			index = count;
		}
		count++;
	}
	return index;
};

// const getSign = (index) =>
// 	[
// 		'born',
// 		'bye',
// 		'college',
// 		'good',
// 		'happy',
// 		'healthy',
// 		'hello',
// 		'help',
// 		'I',
// 		'love',
// 		'man',
// 		'sick',
// 		'study',
// 		'thanks',
// 		'wait',
// 		'waste',
// 		'welcome',
// 		'wish',
// 		'yes',
// 		'You',
// 	][index];

const getSign = (index) =>
	['college', 'good', 'hello', 'I am', 'nill', 'no', 'sick', 'study', 'yes'][
		index
	];

function getNumJs(arrays, len) {
	// console.log(((arrays?.length ?? 0) * (arrays?.[0]?.length ?? 0)),len);
	return arrays ? nj.array(arrays).flatten() : nj.zeros(len);
}

function extractKeypoints(result) {
	const poseArray = result?.poseLandmarks?.map?.((f) => [
		f.x,
		f.y,
		f.z,
		f.visibility,
	]);
	// const faceArray = result?.faceLandmarks
	// 	?.map?.((f) => [f.x, f.y, f.z])
	// 	?.slice?.(0, 468);
	const lhArray = result?.leftHandLandmarks?.map?.((f) => [f.x, f.y, f.z]);
	const rhArray = result?.rightHandLandmarks?.map?.((f) => [f.x, f.y, f.z]);

	const pose = getNumJs(poseArray, 33 * 4);
	// const face = getNumJs(faceArray, 468 * 3);
	const lh = getNumJs(lhArray, 21 * 3);
	const rh = getNumJs(rhArray, 21 * 3);

	return nj.concatenate([pose, lh, rh]);
}

(async () => {
	const model = await tf.loadLayersModel(
		'https://raw.githubusercontent.com/AndroBen/SIH/main/9sign_model/model.json',
	);
	model.summary();

	const holistic = new Holistic({
		locateFile: (file) => {
			return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
		},
	});
	holistic.setOptions({
		modelComplexity: 1,
		smoothLandmarks: true,
		enableSegmentation: true,
		smoothSegmentation: true,
		refineFaceLandmarks: true,
		minDetectionConfidence: 0.5,
		minTrackingConfidence: 0.5,
	});

	const LIMIT = 30;
	let frames = [];

	let isProcessing = false;
	let predictionIndex = -1;

	holistic.onResults(async (results) => {
		try {
			const keypoints = extractKeypoints(results);
			frames.push(keypoints.tolist());
			const inputFrames = frames.slice(
				frames.length - LIMIT,
				frames.length,
			);
			console.log('1');
			if (inputFrames.length >= LIMIT) {
				isProcessing = true;
				frames = frames.slice(
					frames.length - (LIMIT - 5),
					frames.length,
				);

				console.log('2');
				const prediction = model.predict(tf.tensor([inputFrames]));
				const data = await prediction.data();
				const index = findMax(data);
				if (data[index] < 0.5) {
					console.log('not confident');
					isProcessing = false;
					return;
				}

				console.log('3');
				if (predictionIndex === index) {
					isProcessing = false;
					return;
				}

				predictionIndex = index;
				const word = getSign(index);

				console.log('4');
				if (word !== 'nill') postMessage({ word });
				else postMessage({ word: null });
			}
		} catch (error) {
			console.log(error);
		}
		isProcessing = false;
	});

	await holistic.initialize();

	onmessage = async (ev) => {
		try {
			if (isProcessing) return;
			console.log('Worker: start');
			await holistic.send({ image: ev.data.imageBitmap });
		} catch (error) {
			console.error(error);
		}
	};
})();
