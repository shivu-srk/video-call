// socket.io client initialization
const socket = io('/');
// Js method to get ID
const videoGrid = document.getElementById('video-grid');
// To establish new WebRTC connection using PeerJS
const myPeer = new Peer();
let myVideoStream;
const [myLayout, myVideo, myCaption] = createVideoEl();

let videos = [];

const canvas = document.getElementById('canvas_preview');
myVideo.muted = true;
let peers = {},
	currentPeer = [];
let currentUserId = null;

// Persist the data of last few rooms visited on DB
addRoomsToUser();

const toggleButton = document.querySelector('.dark-light');

toggleButton.addEventListener('click', () => {
	document.body.classList.toggle('light-mode');
});

function linkify(inputText) {
	let replacedText, replacePattern1, replacePattern2, replacePattern3;

	//URLs starting with http://, https://, or ftp://
	replacePattern1 =
		/(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=_|!:,.;]*[-A-Z0-9+&@#\/%=_|])/gim;
	replacedText = inputText.replace(
		replacePattern1,
		'<a href="$1" target="_blank">$1</a>',
	);

	//URLs starting with "www." (without // before it, or it'd re-link the ones done above).
	replacePattern2 = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
	replacedText = replacedText.replace(
		replacePattern2,
		'$1<a href="http://$2" target="_blank">$2</a>',
	);

	//Change email addresses to mailto:: links.
	replacePattern3 =
		/(([a-zA-Z0-9\-\_\.])+@[a-zA-Z\_]+?(\.[a-zA-Z]{2,6})+)/gim;
	replacedText = replacedText.replace(
		replacePattern3,
		'<a href="mailto:$1">$1</a>',
	);

	return replacedText;
}

// Browser API to get user video & audio

let isCaptionOn = false;
let isTextOn = false;
const worker = new Worker('worker.js');

let isProcessing = false;

let signCaptionIntervalId;

let imageCapture;

async function initCaption() {
	clearInterval(signCaptionIntervalId);

	signCaptionIntervalId = setInterval(async () => {
		// console.time("interval")
		try {
			const imageBitmap = await imageCapture.grabFrame();
			if (imageBitmap) {
				worker.postMessage({ imageBitmap });
			}
		} catch (error) {
			console.log('error', error);
		}
		// console.timeEnd("interval")
	}, 1000 / 30 + 10);
}

async function initText() {
	annyang.start({ autoRestart: true, continuous: false });
	annyang.addCallback('result', function (phrases) {
		const word = phrases[0];
		myCaption.innerText = word;
		socket.emit('caption', { value: word });
	});
}

async function clearText() {
	annyang.removeCallback('result');
	annyang.abort();
}

navigator.mediaDevices
	.getUserMedia({
		video: true,
		audio: true,
	})
	.then(async (stream) => {
		myVideoStream = stream;
		const width = stream.getVideoTracks()[0].getSettings().width;
		const height = stream.getVideoTracks()[0].getSettings().height;
		const context = canvas.getContext('2d');
		imageCapture = new ImageCapture(stream.getVideoTracks()[0]);
		context.setTransform(-1, 0, 0, 1, canvas.width, 0);
		canvas.width = width;
		canvas.height = height;
		worker.onmessage = (ev) => {
			const { word } = ev.data;
			myCaption.innerText = word;
			socket.emit('caption', { value: word });
		};

		clearInterval(signCaptionIntervalId);

		if (isCaptionOn) {
			initCaption();
		} else {
		}

		clearText();

		if (isTextOn) {
			initText();
		} else {
		}
		// Add video stream to video element
		addVideoStream([myLayout, myVideo, myCaption], stream, 'default');
		// Event of myPeer object
		myPeer.on('call', (call) => {
			call.answer(stream);
			currentPeer.push(call.peerConnection);
			const el = createVideoEl();
			call.on('stream', (userVideoStream) => {
				addVideoStream(el, userVideoStream, call.peer);
			});
			call.on('close', () => {
				el[0].remove();
			});
		});

		socket.on('user-connected', (userId) => {
			connectToNewUser(userId, stream);
		});
		// Input text value
		let text = $('input');
		// When press enter send message
		$('html').keydown(function (e) {
			if (e.which == 13 && text.val().length !== 0) {
				const user = getUser();
				console.log(user);
				// let authId = user.uuid;
				// Emit event on the connected socket connection
				socket.emit('message', { message: text.val(), user });
				text.val('');
			}
		});
		// Callback function for user and message to reflect on the interface
		socket.on('createMessage', ({ message, user }) => {
			console.log(message);
			$('ul').append(
				`<li class="message" style="font-size: 15px" ><b><img width="40px" style="border-radius: 50%; padding: 5px;" src="${
					user.photoURL
				}">${user.displayName}</b><br/>${linkify(
					message.message.content,
				)}</li>`,
			);
			scrollToBottom();
		});

		socket.on('createCaption', ({ userId, data }) => {
			if (currentUserId === userId) return;
			const children = videoGrid.children;
			const container = children.namedItem(userId);
			if (container === null) {
				// document.getElementById("caption_"+userId).
				return;
			}
			if (data)
				document.getElementById('caption_' + userId).innerText =
					data.value;
			else document.getElementById('caption_' + userId).innerText = '';
			// console.log(`${userId} says => ${JSON.stringify(data)}`);
		});
	});

// Remove peers once the connection is deleted
socket.on('user-disconnected', (userId) => {
	document.getElementById(userId)?.remove();
	if (peers[userId]) {
		peers[userId].close();
		let i = currentPeer.indexOf(peers[userId].peerConnection);
		currentPeer = currentPeer.slice(i, i + 1);
		delete peers[userId];
	}
});

// Fetch and display previous messages from the DB onto the application
myPeer.on('open', async (id) => {
	currentUserId = id;
	console.log('Open: ' + id);
	socket.emit('join-room', ROOM_ID, id);
	let resp = await fetch(`${window.location.origin}/message/get`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ room: ROOM_ID }),
	});
	resp = await resp.json();
	resp.messages.forEach((message) => {
		$('ul').append(
			`<li class="message" style="font-size: 15px" ><b><img width="40px" style="border-radius: 50%; padding: 5px;" src="${
				message.user.photoURL
			}">${message.user.displayName}</b><br/>${linkify(
				message.content,
			)}</li>`,
		);
	});
	scrollToBottom();
});

function createVideoEl() {
	const container = document.createElement('div');
	container.classList.add('video_container');
	const video = document.createElement('video');
	video.id = 'video';
	const caption = document.createElement('div');
	caption.id = 'caption';
	caption.classList.add('video_caption');
	container.appendChild(video);
	container.appendChild(caption);
	return [container, video, caption];
}

function connectToNewUser(userId, stream) {
	console.log('connect new user: ' + userId);
	const call = myPeer.call(userId, stream);
	const el = createVideoEl();
	call.on('stream', (userVideoStream) => {
		addVideoStream(el, userVideoStream, userId);
	});
	call.on('close', () => {
		el[0].remove();
	});

	peers[userId] = call;
	currentPeer.push(call.peerConnection);
}

function addVideoStream(el, stream, userId) {
	const [layout, video, caption] = el;
	layout.id = userId;
	caption.id = `caption_${userId}`;
	video.srcObject = stream;
	video.addEventListener('loadedmetadata', () => {
		video.play();
	});
	video.ondblclick = (event) => {
		video.webkitEnterFullScreen();
		video.play();
	};
	video.onpause = () => video.play();
	videoGrid.append(layout);
}

const scrollToBottom = () => {
	var d = $('.main__chat_window');
	d.scrollTop(d.prop('scrollHeight'));
};

const muteUnmute = () => {
	const enabled = myVideoStream.getAudioTracks()[0].enabled;
	if (enabled) {
		myVideoStream.getAudioTracks()[0].enabled = false;
		setUnmuteButton();
	} else {
		setMuteButton();
		myVideoStream.getAudioTracks()[0].enabled = true;
	}
};

const playStop = () => {
	let enabled = myVideoStream.getVideoTracks()[0].enabled;
	if (enabled) {
		myVideoStream.getVideoTracks()[0].enabled = false;
		setPlayVideo();
	} else {
		setStopVideo();
		myVideoStream.getVideoTracks()[0].enabled = true;
	}
};

const toggleCaption = () => {
	if (isCaptionOn) captionOff();
	else captionOn();
};

const captionOn = () => {
	isCaptionOn = true;
	setCaptionOnButton();
	console.warn('Going to on caption');
	initCaption();
};

const captionOff = () => {
	isCaptionOn = false;
	setCaptionOffButton();
	console.warn('shutting down caption');
	clearInterval(signCaptionIntervalId);
	myCaption.innerText = '';
	socket.emit('caption', { value: null });
};

const setCaptionOffButton = () => {
	const html = `
  <i class="noCaption fas fa-closed-captioning"></i>
  <span>Turn On Sign</span>
  `;
	document.querySelector('.main__caption_button').innerHTML = html;
};

const setCaptionOnButton = () => {
	const html = `
  <i class="fas fa-closed-captioning"></i>
  <span>Turn Off Sign</span>
  `;
	document.querySelector('.main__caption_button').innerHTML = html;
};

const toggleText = () => {
	if (isTextOn) textOff();
	else textOn();
};

const textOn = () => {
	isTextOn = true;
	setTextOnButton();
	console.warn('Going to on text');
	initText();
};

const textOff = () => {
	isTextOn = false;
	setTextOffButton();
	console.warn('shutting down text');
	clearText();
	myCaption.innerText = '';
	socket.emit('caption', { value: null });
};

const setTextOffButton = () => {
	const html = `
  <i class="noCaption fas fa-closed-captioning"></i>
  <span>Turn On Caption</span>
  `;
	document.querySelector('.main__text_button').innerHTML = html;
};

const setTextOnButton = () => {
	const html = `
  <i class="fas fa-closed-captioning"></i>
  <span>Turn Off Caption</span>
  `;
	document.querySelector('.main__text_button').innerHTML = html;
};

const setMuteButton = () => {
	const html = `
    <i class="fas fa-microphone"></i>
    <span>Mute</span>
  `;
	document.querySelector('.main__mute_button').innerHTML = html;
};

const setUnmuteButton = () => {
	const html = `
    <i class="unmute fas fa-microphone-slash"></i>
    <span>Unmute</span>
  `;
	document.querySelector('.main__mute_button').innerHTML = html;
};

const setStopVideo = () => {
	const html = `
    <i class="fas fa-video"></i>
    <span>Stop Video</span>
  `;
	document.querySelector('.main__video_button').innerHTML = html;
};

const setPlayVideo = () => {
	const html = `
  <i class="stop fas fa-video-slash"></i>
    <span>Play Video</span>
  `;
	document.querySelector('.main__video_button').innerHTML = html;
};

//screenShare
const screenshare = () => {
	navigator.mediaDevices
		.getDisplayMedia({
			video: {
				cursor: 'always',
			},
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
			},
		})
		.then((stream) => {
			let videoTrack = stream.getVideoTracks()[0];
			videoTrack.onended = function () {
				stopScreenShare();
			};
			for (let x = 0; x < currentPeer.length; x++) {
				let sender = currentPeer[x].getSenders().find(function (s) {
					return s.track.kind == videoTrack.kind;
				});

				sender.replaceTrack(videoTrack);
			}
		});
};

function stopScreenShare() {
	let videoTrack = myVideoStream.getVideoTracks()[0];
	for (let x = 0; x < currentPeer.length; x++) {
		let sender = currentPeer[x].getSenders().find(function (s) {
			return s.track.kind == videoTrack.kind;
		});
		sender.replaceTrack(videoTrack);
	}
}
