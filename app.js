// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBLafZPf9fSXqHjFKcDE-ezEvTstf_cH9Y",
  authDomain: "class-chat-1e947.firebaseapp.com",
  projectId: "class-chat-1e947",
  storageBucket: "class-chat-1e947.firebasestorage.app",
  messagingSenderId: "211336039926",
  appId: "1:211336039926:web:fd4e41406b39579a1c4bd7",
  measurementId: "G-XCW2K9FYJF"
};

if (typeof window.messengerInitialized === 'undefined') {
  window.messengerInitialized = false;
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

document.addEventListener("DOMContentLoaded", () => {
  if (window.messengerInitialized) return;
  window.messengerInitialized = true;

  // --- UI Elements ---
  const screens = {
    login: document.getElementById("login-screen"),
    signup: document.getElementById("signup-screen"),
    chat: document.getElementById("chat-screen"),
    landing: document.getElementById("landing-screen"),
    friends: document.getElementById("friends-screen"),
    groups: document.getElementById("groups-screen"),
    callRooms: document.getElementById("call-rooms-screen"),
    callSession: document.getElementById("call-session-screen"),
    admin: document.getElementById("admin-screen"),
    security: document.getElementById("admin-screen")
  };

  const myFriendsList = document.getElementById("my-friends-list");
  const myGroupsList = document.getElementById("my-groups-list");
  const callRoomsList = document.getElementById("call-rooms-list");
  const callParticipantsGrid = document.getElementById("call-participants-grid");
  const emptyFriendsMsg = document.getElementById("empty-friends-msg");
  const emptyGroupsMsg = document.getElementById("empty-groups-msg");
  const emptyCallsMsg = document.getElementById("empty-calls-msg");
  
  const chatHeaderTitle = document.getElementById("chat-header-title");
  const chatInviteBtn = document.getElementById("chat-invite-btn");
  const chatLeaveBtn = document.getElementById("chat-leave-btn");
  const chatDeleteBtn = document.getElementById("chat-delete-btn");
  const messageList = document.getElementById("message-list");
  const messageInput = document.getElementById("message-input");
  const chatForm = document.getElementById("chat-form");
  const userCountDisplay = document.getElementById("user-count-display");
  
  const addCallBtn = document.getElementById("add-call-btn");
  const addGroupBtn = document.getElementById("add-group-btn");
  const callMicBtn = document.getElementById("call-mic-btn");
  const callLeaveBtn = document.getElementById("call-leave-btn");

  const remoteAudios = document.getElementById("remote-audios");
  const typingIndicator = document.getElementById("typing-indicator");
  const imageInput = document.getElementById("image-input");
  const voiceBtn = document.getElementById("voice-btn");
  const recordingStatus = document.getElementById("recording-status");
  const adminMessageHistory = document.getElementById("admin-message-history");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabViews = document.querySelectorAll(".tab-view");

  // --- Profile UI ---
  const navProfileBtn = document.getElementById("nav-profile-btn");
  const profileModal = document.getElementById("profile-modal");
  const profileCloseBtn = document.getElementById("profile-close-btn");
  const profileNameInput = document.getElementById("profile-name-input");
  const profilePhotoInput = document.getElementById("profile-photo-input");
  const navProfileGroup = document.getElementById("nav-profile-group");

  // --- State ---
  let currentUser = null;
  let allUsers = [];
  let currentRoomId = null;
  let currentChatType = "private";
  
  let peer = null;
  let localStream = null;
  let currentCallRoomId = null;
  let peers = {}; 
  let audioContext = null;
  let analysers = {};
  let micEnabled = true;

  let isDataInitialized = false;
  let authInitialized = false; // Prevents jumping to login on refresh
  let renderCounters = { groups: 0, calls: 0 };
  let isAdminAuthenticated = false;

  // --- ROUTING SYSTEM ---
  function navigateTo(hash) {
    window.location.hash = hash;
  }

  async function handleRoute() {
    const hash = window.location.hash || "#/landing";
    
    // Hard reset all screens & modals
    Object.values(screens).forEach(s => {
      if(s) {
        s.classList.remove("active");
        s.style.setProperty('display', 'none', 'important');
        s.style.opacity = "0";
        s.style.visibility = "hidden";
        s.style.pointerEvents = "none";
      }
    });
    const profileModal = document.getElementById("profile-modal");
    const adminAuthModal = document.getElementById("admin-auth-modal");
    if(profileModal) profileModal.classList.remove("active");
    if(adminAuthModal) adminAuthModal.classList.remove("active");

    console.log("Routing to:", hash);

    if (hash === "#/login" || hash === "#/signup") {
      const target = hash === "#/login" ? "login" : "signup";
      if(screens[target]) {
        screens[target].classList.add("active");
        screens[target].style.setProperty('display', 'flex', 'important');
        screens[target].style.opacity = "1";
        screens[target].style.visibility = "visible";
        screens[target].style.pointerEvents = "auto";
      }
      return;
    }

    if (!authInitialized) return;
    if (!auth.currentUser && hash !== "#/security") {
      navigateTo("#/login");
      return;
    }

    const pathParts = hash.split("/");
    let targetKey = pathParts[1] || "landing";
    if (hash.startsWith("#/chat/")) targetKey = "chat";
    if (hash.startsWith("#/call-session/")) targetKey = "callSession";

    if (targetKey === "admin") {
      navigateTo("#/landing");
      return;
    }

    if (targetKey === "security") {
      if (!isAdminAuthenticated) {
        adminAuthModal.classList.add("active");
        return;
      }
    }

    const screenElement = screens[targetKey];
    if (screenElement) {
      screenElement.classList.add("active");
      screenElement.style.setProperty('display', 'flex', 'important');
      screenElement.style.opacity = "1";
      screenElement.style.visibility = "visible";
      screenElement.style.pointerEvents = "auto";

      if (targetKey === "admin" || targetKey === "security") renderAdminPanel();
      if (targetKey === "chat") {
        if (pathParts[2] && pathParts[3]) loadChat(pathParts[2], pathParts[3]);
      }
      if (targetKey === "callSession") {
        const id = pathParts[2];
        if (id) loadCallSession(id);
      }
    } else {
      navigateTo("#/landing");
    }
  }

  window.addEventListener("hashchange", handleRoute);

  // --- Authentication ---
  auth.onAuthStateChanged((user) => {
    console.log("Firebase Auth State Changed:", user ? user.uid : "Logged Out");
    const wasInitialized = authInitialized;
    authInitialized = true;

    if (user) {
      setupUser(user);
      if (wasInitialized && (window.location.hash === "#/login" || window.location.hash === "#/signup")) {
        navigateTo("#/landing");
      }
    } else {
      cleanupUser();
    }

    // Trigger router on FIRST load or when auth state truly changes
    if (!wasInitialized) {
      handleRoute();
    }
  });

  function setupUser(user) {
    const userRef = db.ref(`users/${user.uid}`);
    userRef.on('value', (snap) => {
      const data = snap.val();
      if (!data) return;
      currentUser = data.username || user.displayName || user.email.split('@')[0];
      
      const presenceRef = db.ref(`presence/${user.uid}`);
      db.ref('.info/connected').on('value', (s) => {
        if (s.val()) {
          presenceRef.onDisconnect().remove();
          presenceRef.set({ uid: user.uid, username: currentUser, avatarUrl: data.avatarUrl || user.photoURL || "" });
        }
      });

      profileNameInput.value = data.username || "";
      if (data.avatarUrl) updateAvatarUI(data.avatarUrl);
    });
    
    if (peer) { peer.destroy(); peer = null; }
    initPeer(user.uid);
    
    if (!isDataInitialized) {
      isDataInitialized = true;
      initRealtimeData();
    }

    if (navProfileGroup) navProfileGroup.style.display = "flex";
  }

  function cleanupUser() {
    currentUser = null;
    isDataInitialized = false;
    if (peer) { peer.destroy(); peer = null; }
    if (navProfileGroup) navProfileGroup.style.display = "none";
    navigateTo("#/login");
  }

  // --- Real-time Data ---
  function initRealtimeData() {
    db.ref('presence').on('value', (snap) => {
      const online = snap.val() ? Object.values(snap.val()).length : 0;
      if (userCountDisplay) userCountDisplay.textContent = `${online}명 접속 중`;
    });

    db.ref(`user_groups/${auth.currentUser.uid}`).on('value', (snap) => {
      renderMyGroups(snap.val());
    });
    
    db.ref(`friends/${auth.currentUser.uid}`).on('value', () => {
      renderMyFriends();
    });

    db.ref('call_rooms').on('value', (snap) => {
      renderCallRooms(snap.val());
    });
  }

  // --- Specific View Loaders ---

  async function loadChat(type, id) {
    currentRoomId = id;
    currentChatType = type;
    messageList.innerHTML = `<div class="loading-msg" style="text-align:center; padding:20px; color:#999;">메시지를 불러오는 중...</div>`;

    if (type === "group") {
      const gSnap = await db.ref(`group_chats/${id}`).once('value');
      const gData = gSnap.val();
      chatHeaderTitle.textContent = gData ? gData.name : "단톡방";
      chatInviteBtn.style.display = "block";
      
      const isCreator = gData && gData.createdBy === auth.currentUser.uid;
      chatDeleteBtn.style.display = isCreator ? "block" : "none";
      chatLeaveBtn.style.display = isCreator ? "none" : "block";

      db.ref(`group_messages/${id}`).off();
      db.ref(`group_messages/${id}`).on('value', renderMessages);
      setupTypingListener("group", id);
    } else {
      const uSnap = await db.ref(`users/${id}`).once('value');
      const uData = uSnap.val();
      chatHeaderTitle.textContent = uData ? uData.username : "대화";
      chatInviteBtn.style.display = "none";
      chatDeleteBtn.style.display = "none";
      chatLeaveBtn.style.display = "none";

      const chatId = auth.currentUser.uid < id ? `${auth.currentUser.uid}_${id}` : `${id}_${auth.currentUser.uid}`;
      db.ref(`private_messages/${chatId}`).off();
      db.ref(`private_messages/${chatId}`).on('value', (snap) => {
        renderMessages(snap);
        markAsRead(chatId);
      });
      
      setupTypingListener("private", id);
    }
  }

  function setupTypingListener(type, id) {
    const typingRef = type === "group" ? db.ref(`typing/group/${id}`) : db.ref(`typing/private/${id < auth.currentUser.uid ? id + "_" + auth.currentUser.uid : auth.currentUser.uid + "_" + id}`);
    typingRef.off();
    typingRef.on('value', (snap) => {
      const data = snap.val() || {};
      const typingUsers = Object.keys(data).filter(uid => uid !== auth.currentUser.uid);
      if (typingUsers.length > 0) {
        typingIndicator.style.display = "block";
        const names = typingUsers.map(uid => data[uid].name).join(", ");
        typingIndicator.textContent = `${names}님이 입력 중...`;
      } else {
        typingIndicator.style.display = "none";
      }
    });
  }

  function markAsRead(chatId) {
    db.ref(`private_messages/${chatId}`).once('value', (snap) => {
      const msgs = snap.val();
      if (!msgs) return;
      Object.keys(msgs).forEach(mid => {
        if (msgs[mid].senderUid !== auth.currentUser.uid && msgs[mid].unread) {
          db.ref(`private_messages/${chatId}/${mid}/unread`).set(false);
        }
      });
    });
  }

  async function loadCallSession(id) {
    currentCallRoomId = id;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      alert("마이크를 찾을 수 없거나 권한이 없습니다.");
      navigateTo("#/call-rooms");
      return;
    }
    
    await db.ref(`call_participants/${id}/${auth.currentUser.uid}`).set({ 
      username: currentUser, 
      avatarUrl: auth.currentUser.photoURL || "" 
    });

    setupVoiceDetection(auth.currentUser.uid, localStream);

    db.ref(`call_participants/${id}`).off();
    db.ref(`call_participants/${id}`).on('value', (snap) => {
      const ps = snap.val() || {};
      renderCallParticipants(ps);
      Object.keys(ps).forEach(uid => { 
        if (uid !== auth.currentUser.uid && !peers[uid]) callUser(uid); 
      });
    });
  }

  // --- Rendering Functions ---

  function renderCallParticipants(participants) {
    if(!callParticipantsGrid) return;
    callParticipantsGrid.innerHTML = "";
    Object.entries(participants).forEach(([uid, p]) => {
      const div = document.createElement("div");
      div.className = "participant-card";
      div.id = `participant-${uid}`;
      div.innerHTML = `
        <div class="avatar-wrapper">
          ${p.avatarUrl ? `<img src="${escapeHTML(p.avatarUrl)}" class="participant-avatar">` : `<div class="participant-avatar center-content">👤</div>`}
          <div class="pulse-ring"></div>
        </div>
        <div class="participant-name">${escapeHTML(p.username)}</div>
      `;
      callParticipantsGrid.appendChild(div);
    });
  }

  function renderMessages(snap) {
    messageList.innerHTML = "";
    const data = snap.val();
    if (!data) return;
    Object.values(data).forEach(msg => {
      const isMe = msg.senderUid === auth.currentUser.uid;
      const div = document.createElement("div");
      div.className = `message ${isMe ? "sent" : "received"}`;
      
      const contentDiv = document.createElement("div");
      contentDiv.className = "message-content";
      
      const bubble = document.createElement("div");
      bubble.className = "bubble";

      if (msg.type === "voice") {
        bubble.className += " voice";
        bubble.innerHTML = `<span class="play-icon">▶️</span> <span>음성 메시지</span>`;
        bubble.onclick = () => {
          const audio = new Audio(msg.url);
          audio.play();
        };
      } else if (msg.type === "image") {
        bubble.className += " image";
        bubble.innerHTML = `<img src="${msg.url}" alt="Image" style="max-width:200px; border-radius:12px;">`;
        bubble.querySelector("img").onclick = () => window.open(msg.url, "_blank");
      } else {
        bubble.textContent = msg.text;
      }

      const info = document.createElement("span");
      info.className = "sender";
      info.textContent = isMe ? "" : msg.sender;

      contentDiv.appendChild(info);
      contentDiv.appendChild(bubble);

      if (isMe && msg.unread && currentChatType === "private") {
        const readStatus = document.createElement("div");
        readStatus.className = "read-status";
        readStatus.textContent = "1";
        div.appendChild(readStatus);
      }

      div.appendChild(contentDiv);
      messageList.appendChild(div);
    });
    messageList.scrollTop = messageList.scrollHeight;
  }

  // --- Audio / Peer Logic ---
  function initPeer(uid) {
    peer = new Peer(uid, { debug: 1 });
    peer.on('call', (call) => {
      if (!localStream) return;
      call.answer(localStream);
      peers[call.peer] = call;
      call.on('stream', (s) => addRemoteAudio(call.peer, s));
    });
  }

  function callUser(uid) {
    const call = peer.call(uid, localStream);
    peers[uid] = call;
    call.on('stream', (s) => addRemoteAudio(uid, s));
    call.on('close', () => removeRemoteAudio(uid));
  }

  function addRemoteAudio(uid, s) {
    let a = document.getElementById(`audio-${uid}`);
    if (!a) { a = document.createElement('audio'); a.id = `audio-${uid}`; a.autoplay = true; remoteAudios.appendChild(a); }
    a.srcObject = s;
    setupVoiceDetection(uid, s);
  }

  function removeRemoteAudio(uid) {
    const a = document.getElementById(`audio-${uid}`);
    if (a) a.remove();
    delete analysers[uid];
    delete peers[uid];
  }

  function setupVoiceDetection(uid, s) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(s);
    const an = audioContext.createAnalyser();
    an.fftSize = 256;
    source.connect(an);
    analysers[uid] = an;
    if (Object.keys(analysers).length === 1) requestAnimationFrame(runVoiceDetection);
  }

  function runVoiceDetection() {
    if (!audioContext) return;
    Object.entries(analysers).forEach(([uid, an]) => {
      const d = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(d);
      let s = 0; for (let i=0; i<d.length; i++) s += d[i];
      const avg = s / d.length;
      const el = document.getElementById(`participant-${uid}`);
      if (el) avg > 10 ? el.classList.add('speaking') : el.classList.remove('speaking');
    });
    if (Object.keys(analysers).length > 0) requestAnimationFrame(runVoiceDetection);
  }

  function stopLocalStream() {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    if (currentCallRoomId) {
      db.ref(`call_participants/${currentCallRoomId}/${auth.currentUser.uid}`).remove();
    }
    if (audioContext) { audioContext.close(); audioContext = null; }
    analysers = {};
  }

  // --- List Rendering ---
  async function renderMyFriends() {
    if (!myFriendsList) return;
    const snap = await db.ref(`friends/${auth.currentUser.uid}`).once('value');
    const data = snap.val();
    myFriendsList.innerHTML = "";
    if (!data) { emptyFriendsMsg.style.display = "block"; return; }
    emptyFriendsMsg.style.display = "none";
    for (const fUid of Object.keys(data)) {
      const uSnap = await db.ref(`users/${fUid}`).once('value');
      const u = uSnap.val();
      if (!u) continue;
      const div = document.createElement("div");
      div.className = "friend-item";
      div.innerHTML = `
        <div class="friend-info">
          ${u.avatarUrl ? `<img src="${escapeHTML(u.avatarUrl)}" class="avatar-sm" style="width:40px; height:40px;">` : `<div class="avatar-sm" style="width:40px; height:40px; display:flex; align-items:center; justify-content:center; background:#eee; font-size:20px;">👤</div>`}
          <div class="friend-details">
            <div class="friend-name">${escapeHTML(u.username)}</div>
            <div class="friend-email">${escapeHTML(u.email)}</div>
          </div>
        </div>
      `;
      div.onclick = () => navigateTo(`#/chat/private/${fUid}`);
      myFriendsList.appendChild(div);
    }
  }

  async function renderMyGroups(groupsIndices) {
    if (!myGroupsList) return;
    const rId = ++renderCounters.groups;
    myGroupsList.innerHTML = "";
    if (!groupsIndices) { emptyGroupsMsg.style.display = "block"; return; }
    emptyGroupsMsg.style.display = "none";
    for (const gid of Object.keys(groupsIndices)) {
      if (rId !== renderCounters.groups) return;
      const gSnap = await db.ref(`group_chats/${gid}`).once('value');
      const gData = gSnap.val();
      if (!gData) continue;
      const mSnap = await db.ref(`group_members/${gid}`).once('value');
      const mCount = mSnap.val() ? Object.keys(mSnap.val()).length : 0;
      const isCreator = gData.createdBy === auth.currentUser.uid;
      const div = document.createElement("div");
      div.className = "group-item";
      div.innerHTML = `<div class="group-info"><div class="group-icon">${escapeHTML(gData.name[0])}</div><div class="group-details"><span class="group-name">${escapeHTML(gData.name)}</span><span class="group-member-count">멤버 ${mCount}명</span></div></div><div class="group-actions"><button class="compact secondary btn-rename">이름 수정</button>${isCreator ? `<button class="compact danger btn-delete">삭제</button>` : ''}</div>`;
      div.querySelector('.btn-rename').onclick = (e) => { e.stopPropagation(); openRenameModal(gid, gData.name); };
      if (isCreator) div.querySelector('.btn-delete').onclick = (e) => { e.stopPropagation(); currentRoomId = gid; deleteGroup(); };
      div.onclick = () => navigateTo(`#/chat/group/${gid}`);
      myGroupsList.appendChild(div);
    }
  }

  async function renderCallRooms(data) {
    if (!callRoomsList) return;
    const rId = ++renderCounters.calls;
    callRoomsList.innerHTML = "";
    if (!data) { emptyCallsMsg.style.display = "block"; return; }
    emptyCallsMsg.style.display = "none";
    for (const [rid, room] of Object.entries(data)) {
      if (rId !== renderCounters.calls) return;
      const pSnap = await db.ref(`call_participants/${rid}`).once('value');
      const pCount = pSnap.val() ? Object.keys(pSnap.val()).length : 0;
      const isCreator = room.createdBy === auth.currentUser.uid;
      const div = document.createElement("div");
      div.className = "call-item";
      div.innerHTML = `<div class="call-icon">📞</div><div class="call-details"><span class="call-title">${escapeHTML(room.name)}</span><span class="call-members">${pCount}명 참여 중</span></div><div class="call-actions"><button class="compact primary btn-join">참가하기</button>${isCreator ? `<button class="compact danger btn-delete">삭제</button>` : ''}</div>`;
      div.querySelector('.btn-join').onclick = (e) => { e.stopPropagation(); navigateTo(`#/call-session/${rid}`); };
      if (isCreator) div.querySelector('.btn-delete').onclick = (e) => { e.stopPropagation(); deleteCallRoom(rid); };
      div.onclick = () => navigateTo(`#/call-session/${rid}`);
      callRoomsList.appendChild(div);
    }
  }

  // --- Deletion / Modals ---
  async function deleteCallRoom(rid) {
    if (!confirm("정말 이 전화방을 삭제하시겠습니까?")) return;
    await db.ref(`call_rooms/${rid}`).remove();
    await db.ref(`call_participants/${rid}`).remove();
  }

  async function deleteGroup() {
    if (!confirm("정말 이 단톡방을 삭제할까요?")) return;
    const gid = currentRoomId;
    const mSnap = await db.ref(`group_members/${gid}`).once('value');
    const members = mSnap.val() ? Object.keys(mSnap.val()) : [];
    const updates = {};
    members.forEach(u => updates[`user_groups/${u}/${gid}`] = null);
    updates[`group_chats/${gid}`] = null;
    updates[`group_members/${gid}`] = null;
    updates[`group_messages/${gid}`] = null;
    await db.ref().update(updates);
    navigateTo("#/groups");
  }

  function openRenameModal(gid, oldName) {
    const groupRenameModal = document.getElementById("group-rename-modal");
    const groupRenameInput = document.getElementById("group-rename-input");
    const groupRenameSubmit = document.getElementById("group-rename-submit");
    const groupRenameCancel = document.getElementById("group-rename-cancel");
    groupRenameInput.value = oldName;
    groupRenameModal.classList.add("active");
    groupRenameSubmit.onclick = async () => {
      const newName = groupRenameInput.value.trim();
      if (newName) { await db.ref(`group_chats/${gid}/name`).set(newName); groupRenameModal.classList.remove("active"); }
    };
    groupRenameCancel.onclick = () => groupRenameModal.classList.remove("active");
  }

  // --- Button Handlers ---
  const startBtnEl = document.getElementById("start-btn");
  if(startBtnEl) startBtnEl.onclick = () => navigateTo("#/friends");
  const groupChatBtnEl = document.getElementById("group-chat-btn");
  if(groupChatBtnEl) groupChatBtnEl.onclick = () => navigateTo("#/groups");
  document.querySelectorAll(".back-btn").forEach(b => b.onclick = () => navigateTo("#/landing"));
  const chatBackBtnEl = document.getElementById("chat-back-btn");
  if(chatBackBtnEl) chatBackBtnEl.onclick = () => navigateTo(currentChatType === "group" ? "#/groups" : "#/friends");
  
  if (addCallBtn) addCallBtn.onclick = async () => {
    const name = prompt("전화방 이름을 입력하세요:");
    if (!name) return;
    const rid = db.ref('call_rooms').push().key;
    await db.ref(`call_rooms/${rid}`).set({ name, createdBy: auth.currentUser.uid });
    navigateTo(`#/call-session/${rid}`);
  };

  if (addGroupBtn) addGroupBtn.onclick = async () => {
    const name = prompt("단톡방 이름을 입력하세요:");
    if (!name) return;
    const gid = db.ref('group_chats').push().key;
    await db.ref(`group_chats/${gid}`).set({ name, createdBy: auth.currentUser.uid });
    await db.ref(`user_groups/${auth.currentUser.uid}/${gid}`).set(true);
    await db.ref(`group_members/${gid}/${auth.currentUser.uid}`).set(true);
    navigateTo(`#/chat/group/${gid}`);
  };

  if (callMicBtn) callMicBtn.onclick = () => {
    micEnabled = !micEnabled;
    localStream.getAudioTracks()[0].enabled = micEnabled;
    callMicBtn.innerHTML = micEnabled ? "🎙️" : "🔇";
    callMicBtn.className = `control-btn ${micEnabled ? "mic-on" : "mic-off"}`;
  };

  if (callLeaveBtn) callLeaveBtn.onclick = () => navigateTo("#/call-rooms");

  // --- Profile / Nav Handlers ---
  if (navProfileBtn) navProfileBtn.onclick = () => profileModal.classList.add("active");
  
  async function saveProfile() {
    const newName = profileNameInput.value.trim();
    const file = profilePhotoInput ? profilePhotoInput.files[0] : null;
    if (!newName && !file) return;

    try {
      console.log("Auto-saving profile in background...");
      let avatarUrl = null;
      if (file) {
        // Drastically speed up upload by compressing image client-side
        console.log("Compressing image...");
        const compressedBlob = await compressImage(file);
        
        const storageRef = storage.ref(`profile_photos/${auth.currentUser.uid}`);
        const snapshot = await storageRef.put(compressedBlob);
        avatarUrl = await snapshot.ref.getDownloadURL();
      }

      const updates = {};
      if (newName) updates[`users/${auth.currentUser.uid}/username`] = newName;
      if (avatarUrl) updates[`users/${auth.currentUser.uid}/avatarUrl`] = avatarUrl;
      
      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }
      console.log("Background save success");
    } catch (err) {
      console.error("Background save error:", err);
    }
  }

  if (profileCloseBtn) {
    profileCloseBtn.onclick = () => {
      // Close immediately, save in background
      saveProfile();
      profileModal.classList.remove("active");
    };
  }

  async function compressImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 400;
          const MAX_HEIGHT = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  if (profilePhotoInput) {
    profilePhotoInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => updateAvatarUI(ev.target.result);
        reader.readAsDataURL(file);
      }
    };
  }

  const navDeleteAccountBtn = document.getElementById("nav-delete-account-btn");
  if (navDeleteAccountBtn) {
    navDeleteAccountBtn.onclick = async () => {
      if (!confirm("정말 회원탈퇴를 하시겠습니까? 모든 데이터가 삭제되며 복구할 수 없습니다.")) return;
      try {
        const uid = auth.currentUser.uid;
        await db.ref(`users/${uid}`).remove();
        await db.ref(`presence/${uid}`).remove();
        await auth.currentUser.delete();
        alert("회원탈퇴가 완료되었습니다.");
        navigateTo("#/login");
      } catch (err) {
        if (err.code === 'auth/requires-recent-login') {
          alert("보안을 위해 다시 로그인한 후 탈퇴를 진행해주세요.");
          auth.signOut();
        } else {
          alert("회원탈퇴 중 오류가 발생했습니다: " + err.message);
        }
      }
    };
  }

  const adminAuthModal = document.getElementById("admin-auth-modal");
  const adminAuthSubmit = document.getElementById("admin-auth-submit");
  const adminAuthCancel = document.getElementById("admin-auth-cancel");
  const adminPasswordInput = document.getElementById("admin-password-input");

  if (adminAuthCancel) adminAuthCancel.onclick = () => {
    adminAuthModal.classList.remove("active");
    if (window.location.hash === "#/security") {
      navigateTo("#/landing");
    }
  };
  
  if (adminAuthSubmit) {
    adminAuthSubmit.onclick = () => {
      if (adminPasswordInput.value === "antigravity") {
        isAdminAuthenticated = true;
        adminAuthModal.classList.remove("active");
        handleRoute();
      } else {
        alert("비밀번호가 틀렸습니다.");
      }
    };
  }

  // --- Password Toggle Logic ---
  document.querySelectorAll('.password-toggle-btn').forEach(btn => {
    btn.onclick = (e) => {
      const input = e.currentTarget.previousElementSibling;
      if (input.type === 'password') {
        input.type = 'text';
        e.currentTarget.classList.add('showing');
      } else {
        input.type = 'password';
        e.currentTarget.classList.remove('showing');
      }
    };
  });

  // --- Admin Tabs ---
  tabBtns.forEach(btn => {
    btn.onclick = () => {
      const target = btn.id.replace("tab-", "").replace("-btn", "");
      tabBtns.forEach(b => b.classList.remove("active"));
      tabViews.forEach(v => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`admin-${target}-view`).classList.add("active");
      if (target === "history") loadAllMessages();
    };
  });

  // --- Admin Logic ---
  function renderAdminPanel() {
    const adminUsersList = document.getElementById("admin-users-list");
    const statTotalUsers = document.getElementById("stat-total-users");
    const statTotalMsgs = document.getElementById("stat-total-msgs");
    if (!adminUsersList) return;

    Promise.all([
      db.ref('users').once('value'),
      db.ref('presence').once('value')
    ]).then(([uSnap, pSnap]) => {
      const users = uSnap.val() || {};
      const presences = pSnap.val() || {};
      if (statTotalUsers) statTotalUsers.textContent = Object.keys(users).length;
      adminUsersList.innerHTML = "";
      Object.entries(users).forEach(([uid, u]) => {
        const isOnline = !!presences[uid];
        const statusHTML = `<span style="font-size:11px; margin-left:8px; color:${isOnline ? '#2ed573' : '#a4b0be'}; font-weight:bold;">${isOnline ? '🟢 온라인' : '⚪ 오프라인'}</span>`;
        const div = document.createElement("div");
        div.className = "friend-item";
        div.innerHTML = `
          <div class="friend-info">👤 
            <div class="friend-details">
              <b>${escapeHTML(u.username)}</b> ${statusHTML}<br>
              <small>✉️ ${escapeHTML(u.email)} | 🔑 ${escapeHTML(u.password || "비공개")}</small>
            </div>
          </div>
          <button class="compact danger btn-kick" data-uid="${uid}" style="padding: 6px 12px; font-size: 11px; border-radius: 6px; border:none; background:#ff4757; color:white; cursor:pointer;">추방</button>
        `;
        div.querySelector('.btn-kick').onclick = () => kickUser(uid, u.username);
        adminUsersList.appendChild(div);
      });
    });

    // 간단한 통계 업데이트
    db.ref('private_messages').once('value', (pSnap) => {
      db.ref('group_messages').once('value', (gSnap) => {
        let count = 0;
        const pData = pSnap.val() || {};
        Object.values(pData).forEach(chat => count += Object.keys(chat).length);
        const gData = gSnap.val() || {};
        Object.values(gData).forEach(chat => count += Object.keys(chat).length);
        if (statTotalMsgs) statTotalMsgs.textContent = count;
      });
    });
  }

  window.kickUser = async function(uid, username) {
    if (!confirm(`${username}님을 정말 추방하시겠습니까? 데이터가 모두 삭제됩니다.`)) return;
    try {
      await db.ref(`users/${uid}`).remove();
      await db.ref(`presence/${uid}`).remove();
      alert(`${username}님이 추방되었습니다.`);
      renderAdminPanel();
    } catch (err) {
      alert("추방 처리 중 오류가 발생했습니다.");
    }
  };

  async function loadAllMessages() {
    if (!adminMessageHistory) return;
    adminMessageHistory.innerHTML = `<div style="text-align:center; padding:20px; color:#999;">기록을 불러오는 중...</div>`;
    
    const [privateSnap, groupSnap] = await Promise.all([
      db.ref('private_messages').once('value'),
      db.ref('group_messages').once('value')
    ]);

    const allMsgs = [];
    const pData = privateSnap.val() || {};
    Object.keys(pData).forEach(chatId => {
      Object.values(pData[chatId]).forEach(m => allMsgs.push({ ...m, chat: `[1:1] ${chatId}` }));
    });
    const gData = groupSnap.val() || {};
    Object.keys(gData).forEach(gid => {
      Object.values(gData[gid]).forEach(m => allMsgs.push({ ...m, chat: `[그룹] ${gid}` }));
    });

    allMsgs.sort((a,b) => b.timestamp - a.timestamp);
    adminMessageHistory.innerHTML = "";
    allMsgs.slice(0, 100).forEach(msg => {
      const div = document.createElement("div");
      div.className = "admin-message-item";
      div.innerHTML = `
        <div style="font-size:10px; color:#888;">${msg.chat} | ${new Date(msg.timestamp).toLocaleString()}</div>
        <div style="font-weight:700;">${msg.sender}:</div>
        <div>${msg.type === 'voice' ? '[음성 메시지]' : msg.type === 'image' ? '[이미지]' : escapeHTML(msg.text)}</div>
      `;
      adminMessageHistory.appendChild(div);
    });
  }

  function updateAvatarUI(url) {
    const navAvatarImg = document.getElementById("nav-avatar-img");
    const navAvatarEmoji = document.getElementById("nav-avatar-emoji");
    const profileAvatarImg = document.getElementById("profile-avatar-img");
    const profileAvatarEmoji = document.getElementById("profile-avatar-emoji");

    if (url) {
      if(navAvatarImg) { navAvatarImg.src = url; navAvatarImg.style.display="block"; }
      if(navAvatarEmoji) navAvatarEmoji.style.display="none";
      if(profileAvatarImg) { profileAvatarImg.src = url; profileAvatarImg.style.display="block"; }
      if(profileAvatarEmoji) profileAvatarEmoji.style.display="none";
    }
  }

  const sendBtn = chatForm.querySelector('button[type="submit"]');

  chatForm.onsubmit = async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text && !pendingImageFile) return;

    messageInput.disabled = true;
    sendBtn.disabled = true;
    const originalBtnText = sendBtn.textContent;
    sendBtn.textContent = "전송 중...";

    try {
      const path = currentChatType === "group" ? `group_messages/${currentRoomId}` : `private_messages/${auth.currentUser.uid < currentRoomId ? auth.currentUser.uid + "_" + currentRoomId : currentRoomId + "_" + auth.currentUser.uid}`;
      
      if (pendingImageFile) {
        const compressedBlob = await compressImageForChat(pendingImageFile);
        await uploadFile(compressedBlob, 'image');
        pendingImageFile = null;
        if(imagePreviewContainer) imagePreviewContainer.style.display = "none";
        imageInput.value = "";
      }

      if (text) {
        db.ref(path).push({ text, senderId: auth.currentUser.uid, sender: currentUser, timestamp: Date.now(), senderUid: auth.currentUser.uid, unread: true });
        messageInput.value = "";
      }
    } catch (err) {
      console.error(err);
      alert("전송 실패: " + err.message);
    } finally {
      messageInput.disabled = false;
      sendBtn.disabled = false;
      sendBtn.textContent = originalBtnText;
      messageInput.focus();
      updateTypingState(false);
    }
  };

  messageInput.oninput = () => updateTypingState(true);
  messageInput.onblur = () => updateTypingState(false);

  let typingTimeout = null;
  function updateTypingState(isTyping) {
    const chatId = currentChatType === "group" ? currentRoomId : (auth.currentUser.uid < currentRoomId ? auth.currentUser.uid + "_" + currentRoomId : currentRoomId + "_" + auth.currentUser.uid);
    const path = currentChatType === "group" ? `typing/group/${chatId}/${auth.currentUser.uid}` : `typing/private/${chatId}/${auth.currentUser.uid}`;
    
    if (isTyping) {
      db.ref(path).set({ name: currentUser });
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => updateTypingState(false), 3000);
    } else {
      db.ref(path).remove();
    }
  }

  // --- Voice / Image Upload ---
  let mediaRecorder = null;
  let chunks = [];
  let currentStream = null;
  voiceBtn.onclick = async () => {
    if (!mediaRecorder) {
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(currentStream);
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        mediaRecorder.onstop = async () => {
          recordingStatus.style.display = "none";
          voiceBtn.textContent = "🎤";
          if (currentStream) {
            currentStream.getTracks().forEach(t => t.stop());
            currentStream = null;
          }
          const blob = new Blob(chunks, { type: 'audio/webm' });
          chunks = [];
          try {
            await uploadFile(blob, 'voice');
          } catch (err) {
            console.error("Voice upload error:", err);
            alert("음성 전송 실패: " + err.message);
          }
        };
        mediaRecorder.start();
        recordingStatus.style.display = "inline";
        voiceBtn.textContent = "⏹️";
      } catch (err) {
        alert("마이크 접근을 허용해주세요.");
      }
    } else {
      mediaRecorder.stop();
      mediaRecorder = null;
    }
  };

  let pendingImageFile = null;
  const imagePreviewContainer = document.getElementById("image-preview-container");
  const imagePreviewImg = document.getElementById("image-preview-img");
  const imagePreviewCancel = document.getElementById("image-preview-cancel");

  if (imagePreviewCancel) {
    imagePreviewCancel.onclick = () => {
      pendingImageFile = null;
      if(imagePreviewContainer) imagePreviewContainer.style.display = "none";
      imageInput.value = "";
    };
  }

  imageInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      pendingImageFile = file;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if(imagePreviewImg) imagePreviewImg.src = ev.target.result;
        if(imagePreviewContainer) imagePreviewContainer.style.display = "block";
      };
      reader.readAsDataURL(file);
    }
  };

  async function compressImageForChat(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1920;
          const MAX_HEIGHT = 1920;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadFile(file, type) {
    const timestamp = Date.now();
    const ext = type === 'voice' ? 'webm' : 'jpg';
    const path = `chat_files/${type}/${auth.currentUser.uid}_${timestamp}.${ext}`;
    const ref = storage.ref(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    
    const chatPath = currentChatType === "group" ? `group_messages/${currentRoomId}` : `private_messages/${auth.currentUser.uid < currentRoomId ? auth.currentUser.uid + "_" + currentRoomId : currentRoomId + "_" + auth.currentUser.uid}`;
    db.ref(chatPath).push({ type, url, senderId: auth.currentUser.uid, sender: currentUser, timestamp, senderUid: auth.currentUser.uid, unread: true });
  }

  // --- Landing Page Listeners ---
  const startBtn = document.getElementById("start-btn");
  const groupChatBtn = document.getElementById("group-chat-btn");
  if (startBtn) startBtn.onclick = () => navigateTo("#/friends");
  if (groupChatBtn) groupChatBtn.onclick = () => navigateTo("#/groups");

  const btnGoToSignup = document.getElementById("btn-go-to-signup");
  const btnGoToLogin = document.getElementById("btn-go-to-login");
  if(btnGoToSignup) btnGoToSignup.onclick = () => navigateTo("#/signup");
  if(btnGoToLogin) btnGoToLogin.onclick = () => navigateTo("#/login");

  function escapeHTML(str) {
    if(!str) return "";
    return str.replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t] || t));
  }

  // --- Auth Handlers ---
  const loginForm = document.getElementById("login-form");
  const loginEmailInput = document.getElementById("login-email-input");
  const loginPasswordInput = document.getElementById("login-password-input");
  
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await auth.signInWithEmailAndPassword(loginEmailInput.value, loginPasswordInput.value);
        loginEmailInput.value = '';
        loginPasswordInput.value = '';
      } catch (err) {
        alert("로그인 실패: " + err.message);
      }
    };
  }

  const signupForm = document.getElementById("signup-form");
  const signupNameInput = document.getElementById("signup-name-input");
  const signupEmailInput = document.getElementById("signup-email-input");
  const signupPasswordInput = document.getElementById("signup-password-input");

  if (signupForm) {
    signupForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const cred = await auth.createUserWithEmailAndPassword(signupEmailInput.value, signupPasswordInput.value);
        await db.ref(`users/${cred.user.uid}`).set({
          username: signupNameInput.value,
          email: signupEmailInput.value,
          password: signupPasswordInput.value,
          createdAt: Date.now()
        });
        signupNameInput.value = '';
        signupEmailInput.value = '';
        signupPasswordInput.value = '';
      } catch (err) {
        alert("회원가입 실패: " + err.message);
      }
    };
  }

  // --- Friend Search Autocomplete ---
  const friendSearchInput = document.getElementById("friend-search-input");
  const friendSearchDropdown = document.getElementById("friend-search-dropdown");

  let friendSearchTimeout = null;

  if (friendSearchInput) {
    friendSearchInput.addEventListener("input", (e) => {
      const query = e.target.value.trim().toLowerCase();
      
      if (!query) {
        friendSearchDropdown.style.display = "none";
        return;
      }

      clearTimeout(friendSearchTimeout);
      friendSearchTimeout = setTimeout(async () => {
        try {
          const snap = await db.ref('users').once('value');
          const users = snap.val();
          if (!users) return;

          let matches = [];
          
          Object.entries(users).forEach(([uid, u]) => {
            if (uid === auth.currentUser.uid) return; // exclude self
            
            const name = (u.username || "").toLowerCase();
            if (name.includes(query)) {
              matches.push({
                uid,
                username: u.username,
                email: u.email,
                avatarUrl: u.avatarUrl || "",
                exactMatch: name === query,
                startsWith: name.startsWith(query)
              });
            }
          });

          // Sort: exact matches first, then starts with, then includes
          matches.sort((a, b) => {
            if (a.exactMatch && !b.exactMatch) return -1;
            if (!a.exactMatch && b.exactMatch) return 1;
            if (a.startsWith && !b.startsWith) return -1;
            if (!a.startsWith && b.startsWith) return 1;
            return a.username.localeCompare(b.username);
          });

          friendSearchDropdown.innerHTML = "";
          
          if (matches.length === 0) {
            friendSearchDropdown.innerHTML = `<div style="padding: 15px; text-align: center; color: #888; font-size: 13px;">결과가 없습니다.</div>`;
            friendSearchDropdown.style.display = "block";
            return;
          }

          matches.slice(0, 5).forEach(m => { // show top 5 matches
            const item = document.createElement("div");
            item.style.padding = "10px 15px";
            item.style.borderBottom = "1px solid #eee";
            item.style.display = "flex";
            item.style.alignItems = "center";
            item.style.justifyContent = "space-between";
            item.style.cursor = "pointer";
            item.style.transition = "background-color 0.2s";
            
            // Add hover effect
            item.addEventListener("mouseenter", () => item.style.backgroundColor = "#f9f9f9");
            item.addEventListener("mouseleave", () => item.style.backgroundColor = "transparent");

            item.innerHTML = `
              <div style="display: flex; align-items: center; gap: 10px;">
                ${m.avatarUrl ? `<img src="${escapeHTML(m.avatarUrl)}" class="avatar-sm" style="width: 32px; height: 32px; border-width: 1px;">` : `<div class="avatar-sm" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: #eee; font-size: 16px; border-width: 1px;">👤</div>`}
                <div>
                  <div style="font-weight: 700; font-size: 14px; color: #333;">${escapeHTML(m.username)}</div>
                  <div style="font-size: 11px; color: #888;">${escapeHTML(m.email)}</div>
                </div>
              </div>
              <button class="btn-primary" style="padding: 6px 12px; border-radius: 12px; font-size: 12px; width: auto; margin: 0;">추가</button>
            `;

            const addBtn = item.querySelector("button");
            addBtn.onclick = async (ev) => {
              ev.stopPropagation(); // prevent clicking item
              try {
                // Add friend logic
                await db.ref(`friends/${auth.currentUser.uid}/${m.uid}`).set(true);
                await db.ref(`friends/${m.uid}/${auth.currentUser.uid}`).set(true);
                
                alert(`${m.username}님을 친구로 추가했습니다!`);
                friendSearchInput.value = "";
                friendSearchDropdown.style.display = "none";
              } catch (err) {
                alert("친구 추가 중 오류가 발생했습니다.");
              }
            };
            
            item.onclick = () => {
              friendSearchInput.value = m.username;
              // Optionally do something on item click
            };

            friendSearchDropdown.appendChild(item);
          });

          friendSearchDropdown.style.display = "block";
          
        } catch (err) {
          console.error("Search error", err);
        }
      }, 300); // 300ms debounce
    });

    // Hide dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!friendSearchInput.contains(e.target) && !friendSearchDropdown.contains(e.target)) {
        friendSearchDropdown.style.display = "none";
      }
    });
    
    // Show dropdown when focused if there's text
    friendSearchInput.addEventListener("focus", () => {
      if (friendSearchInput.value.trim() && friendSearchDropdown.innerHTML !== "") {
        friendSearchDropdown.style.display = "block";
      }
    });
  }
});
