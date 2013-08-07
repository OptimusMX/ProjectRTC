var PeerManager = (function () {

  var localId,
      config = {
        peerConnectionConfig: {
          iceServers: [
                        {"url": "stun:23.21.150.121"},
                        {"url": "stun:stun.l.google.com:19302"}
                      ]
        },
        peerConnectionConstraints: {
          optional: [{"DtlsSrtpKeyAgreement": true}]
        },
        mediaConstraints: {
          'mandatory': {
            'OfferToReceiveAudio': true,
            'OfferToReceiveVideo': true
          }
        }
      },
      peerDatabase = {},
      localStream,
      remoteVideoContainer = document.getElementById('remoteVideosContainer'),
      connection = io.connect(window.location.origin);
      
  connection.on('message', handleMessage);
  connection.on('id', function(id) {
    localId = id;
  });
      
  function addPeer(remoteId) {
    var peer = new Peer(config.peerConnectionConfig, config.peerConnectionConstraints);
    peer.pc.onicecandidate = function(event) {
      if (event.candidate) {
        send('candidate', remoteId, {
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate
        });
      }
    };
    peer.pc.onaddstream = function(event) {
      attachMediaStream(peer.remoteVideoEl, event.stream);
      remoteVideosContainer.appendChild(peer.remoteVideoEl);
    };
    peer.pc.onremovestream = function(event) {
      remoteVideosContainer.removeChild(peer.remoteVideoEl);
    };
    peer.pc.oniceconnectionstatechange = function(event) {
      ice = event.srcElement || event.target;
      if(ice.iceConnectionState == 'disconnected') {
          remoteVideosContainer.removeChild(peer.remoteVideoEl);
      }
    }

    peerDatabase[remoteId] = peer;
        
    return peer;
  }
  function answer(remoteId) {
    var pc = peerDatabase[remoteId].pc;
    pc.createAnswer(
      function(sessionDescription) {
        pc.setLocalDescription(sessionDescription);
        send('answer', remoteId, sessionDescription);
      }, 
      function(error) { 
        console.log(error);
      },
      config.mediaConstraints
    );
  }
  function offer(remoteId) {
    var pc = peerDatabase[remoteId].pc;
    pc.createOffer(
      function(sessionDescription) {
        pc.setLocalDescription(sessionDescription);
        send('offer', remoteId, sessionDescription);
      }, 
      function(error) { 
        console.log(error);
      },
      config.mediaConstraints
    );
  }
  function handleMessage(message) {
    var type = message.type,
        from = message.from,
        peer = peerDatabase[from] || addPeer(from);
  
    switch (type) {
      case 'init':
        setLocalStream(peer);
        offer(from);
        break;
      case 'offer':
        peer.pc.setRemoteDescription(new RTCSessionDescription(message.payload));
        answer(from);
        break;
      case 'answer':
        peer.pc.setRemoteDescription(new RTCSessionDescription(message.payload));
        break;
      case 'candidate':
        if(peer.pc.remoteDescription) {
          peer.pc.addIceCandidate(new RTCIceCandidate({
            sdpMLineIndex: message.payload.label,
            sdpMid: message.payload.id,
            candidate: message.payload.candidate
          }));
        }
        break;
    }
  }
  function send(type, to, payload) {
    connection.emit('message', {
      to: to,
      type: type,
      payload: payload
    });
  }
  function setLocalStream(peer) {
    if(localStream) {
      peer.pc.getLocalStreams().length ? peer.pc.removeStream(localStream) : peer.pc.addStream(localStream);
    }
  }

  return {
      getId: function() {
        return localId;
      },
      
      setLocalStream: function(stream) {
        localStream = stream;
      },
      
      peerInit: function(remoteId) {
        peer = peerDatabase[remoteId] || addPeer(remoteId);
        setLocalStream(peer);
        send('init', remoteId, null);
      },

      send: function(type, payload) {
        connection.emit(type, payload);
      }
  };
  
});

var Peer = function (pcConfig, pcConstraints) {
  this.pc = new RTCPeerConnection(pcConfig, pcConstraints);
  this.remoteVideoEl = document.createElement('video');
}