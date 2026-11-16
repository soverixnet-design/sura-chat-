/* Oracle audio provider, compatible with the room controller's lifecycle. */
(function () {
  'use strict';
  var loading;
  function load() {
    if (window.LivekitClient) return Promise.resolve(adapter);
    if (!loading) loading = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/livekit-client@2.24.1/dist/livekit-client.umd.js';
      script.integrity = 'sha384-GpoGEkJlx2sLomFuCCD/fOOaQojhrcwfW03ncXAYsWGWrC3G72awbt2c21WDrOvH';
      script.crossOrigin = 'anonymous';
      script.onload = function () { window.LivekitClient ? resolve(adapter) : reject(Error('LiveKit unavailable')); };
      script.onerror = function () { reject(Error('Oracle voice SDK could not load')); };
      document.head.appendChild(script);
    }).catch(function (error) { loading = null; throw error; });
    return loading;
  }
  var adapter = {
    init: async function (options) {
      var sdk = window.LivekitClient;
      var room = new sdk.Room({adaptiveStream:true, dynacast:true});
      var events = {}, mediaEvents = {}, elements = new Set(), closed = false;
      var emit = function (name, data) { if (events[name]) events[name](data); };
      // A server kick or failed connection must release remote audio immediately,
      // even when the room controller has not yet called leave().
      var clearRemoteAudio = function () {
        elements.forEach(function (element) {
          element.pause(); element.srcObject = null; element.remove();
        });
        elements.clear();
      };
      room.on(sdk.RoomEvent.TrackSubscribed, function (track) {
        if (track.kind !== sdk.Track.Kind.Audio || closed) return;
        var element = track.attach();
        element.autoplay = true; element.setAttribute('playsinline','');
        element.hidden = true; document.body.appendChild(element); elements.add(element);
        var playing = element.play(); if (playing) playing.catch(function () {});
      });
      room.on(sdk.RoomEvent.TrackUnsubscribed, function (track) {
        track.detach().forEach(function (element) { elements.delete(element); element.remove(); });
      });
      room.on(sdk.RoomEvent.ConnectionStateChanged, function (state) {
        if (mediaEvents.mediaConnectionUpdate) mediaEvents.mediaConnectionUpdate({transport:'consuming',state:state});
      });
      room.on(sdk.RoomEvent.Disconnected, function (reason) {
        closed = true;
        clearRemoteAudio();
        emit('roomLeft',{state:reason===sdk.DisconnectReason.PARTICIPANT_REMOVED?'kicked':'disconnected'});
      });
      return {
        provider:'livekit',
        self:{
          get audioEnabled() { return room.localParticipant.isMicrophoneEnabled; },
          enableAudio: function () { return room.localParticipant.setMicrophoneEnabled(true); },
          disableAudio: function () { return room.localParticipant.setMicrophoneEnabled(false); },
          on: function (name, callback) { events[name] = callback; }
        },
        meta:{on:function (name, callback) { mediaEvents[name] = callback; }},
        join: async function () {
          await room.connect(options.serverUrl,options.authToken,{autoSubscribe:true});
          await room.startAudio();
        },
        leave: async function () {
          closed = true;
          try { await room.disconnect(); }
          finally { clearRemoteAudio(); }
        }
      };
    }
  };
  window.SuraLiveKit = {load:load};
})();
