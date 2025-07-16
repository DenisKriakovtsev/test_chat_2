import { OngoingCall, Participants, PeerData, SocketUser } from "@/types";
import { useUser } from "@clerk/nextjs";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { createContext } from "react";
import { Socket, io } from "socket.io-client";
import Peer, { SignalData } from 'simple-peer';
interface Props {
    [propName: string]: any;
}
interface iSocketContext {
    socket: Socket | null,
    onlineUsers: SocketUser[] | null
    ongoingCall: OngoingCall | null
    localStream: MediaStream | null;
    peer: PeerData | null;
    isCallEnded: boolean;
    handleCall: (user: SocketUser) => void
    handleJoinCall: (ongoingCall: OngoingCall) => void
    handleHangup: (data: { ongoingCall?: OngoingCall, callEnded?: boolean }) => void
    // --- chat ---
    chatMessages: ChatMessage[];
    sendMessage: (msg: string, to?: string, file?: { name: string, type: string, data: string }) => void;
}

export const SocketContext = createContext<iSocketContext | null>(null);

// тип для сообщений чата
export interface ChatMessage {
    from: string;
    to?: string;
    message: string;
    timestamp: number;
    // file support
    fileName?: string;
    fileType?: string;
    fileData?: string; // base64
}

export const SocketContextProvider = (props: Props) => {
    const { user } = useUser();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState<SocketUser[] | null>(null);
    const [ongoingCall, setOngoingCall] = useState<OngoingCall | null>(null)
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [peer, setPeer] = useState<PeerData | null>(null);
    const [isCallEnded, setIsCallEnded] = useState(false)
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

    const currentSocketUser = onlineUsers?.find(onlineUser => onlineUser.userId === user?.id)

    const getMediaStream = useCallback(
        async (faceMode?: string) => {
            if (localStream) {
                return localStream;
            }

            try {
                // Get all media devices
                const devices = await navigator.mediaDevices.enumerateDevices();

                // Filter out only the video input devices
                const videoDevices = devices.filter((device) => device.kind === 'videoinput');

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { min: 640, ideal: 1280, max: 1920 },
                        height: { min: 360, ideal: 720, max: 1080 },
                        frameRate: { min: 16, ideal: 30, max: 30 },
                        facingMode: videoDevices.length > 0 ? faceMode : undefined
                    },
                    audio: true
                });

                setLocalStream(stream);

                return stream;
            } catch (error) {
                console.error('Failed to get stream', error);
                setLocalStream(null);
                return null;
            }
        },
        [localStream]
    );

    const onIncomingCall = useCallback((participants: Participants) => {
        if (ongoingCall && socket && user) {
            socket.emit('hangup', {
                ongoingCall: {
                    participants,
                    isRinging: false,
                },
                userHangingupId: user.id
            })
            return
        }

        setOngoingCall({
            participants,
            isRinging: true,
        })
    }, [ongoingCall, socket, user])

    const addStreamToPeer = useCallback((stream: MediaStream) => {
        setPeer((prevPeer) => {
            if (prevPeer) {
                return { ...prevPeer, stream }
            } else return prevPeer
        });
    }, [setPeer]);

    const createPeer = useCallback(
        (stream: MediaStream, initiator: boolean, participantUser: SocketUser) => {
            const iceServers: RTCIceServer[] = [
                {
                    urls: [
                        "stun:stun.l.google.com:19302",
                        "stun:stun1.l.google.com:19302",
                        "stun:stun2.l.google.com:19302",
                        "stun:stun3.l.google.com:19302",
                        // Пример бесплатного TURN-сервера (для теста, не для продакшена)
                        "turn:openrelay.metered.ca:80",
                        "turn:openrelay.metered.ca:443",
                        "turn:openrelay.metered.ca:443?transport=tcp"
                    ],
                    username: "openrelayproject",
                    credential: "openrelayproject"
                }
            ];

            const peer = new Peer({
                stream,
                initiator,
                trickle: true,
                config: { iceServers }
            });

            peer.on('stream', (stream: MediaStream) => {
                console.log('PEER GOT STREAM', stream);
                addStreamToPeer(stream);
            });
            peer.on('signal', data => {
                console.log('PEER SIGNAL', data);
            });
            peer.on('error', err => {
                console.error('PEER ERROR', err);
            });
            peer.on('close', () => {
                console.log('PEER CLOSED');
                handleHangup({ callEnded: true });
            });

            const rtcPeerConnection: RTCPeerConnection = (peer as any)._pc;

            rtcPeerConnection.oniceconnectionstatechange = async () => {
                console.log('ICE STATE', rtcPeerConnection.iceConnectionState);
                if (
                    rtcPeerConnection.iceConnectionState === 'disconnected' ||
                    rtcPeerConnection.iceConnectionState === 'failed'
                ) {
                    handleHangup({ ongoingCall: ongoingCall })
                }
            };

            return peer;
        },
        [ongoingCall]
    );

    const completePeerConnection = useCallback(
        async (connectionData: { sdp: SignalData; ongoingCall: OngoingCall; isCaller: boolean }) => {
            if (!localStream) {
                console.log('Missing localStream');
                return;
            }

            console.log('Peer', peer)

            if (peer) {
                peer.peerConnection?.signal(connectionData.sdp)
                return;
            }

            let participantUser;

            if (connectionData.isCaller) {
                participantUser = connectionData.ongoingCall.participants.caller;
            } else {
                participantUser = connectionData.ongoingCall.participants.receiver;
            }

            const newPeer = createPeer(localStream, true, participantUser);

            setPeer({
                peerConnection: newPeer,
                participantUser,
                stream: undefined
            });

            newPeer.on('signal', async (data: SignalData) => {
                if (socket) {
                    console.log('emit answer');
                    socket.emit('webrtcSignal', {
                        sdp: data,
                        ongoingCall: connectionData.ongoingCall,
                        isCaller: !connectionData.isCaller
                    });
                }
            });
        },
        [localStream, createPeer, peer, ongoingCall]
    );

    const handleCall = useCallback(async (user: SocketUser) => {
        setIsCallEnded(false)
        if (!currentSocketUser) return
        if (ongoingCall) return alert('Already in another call')

        const stream = await getMediaStream();

        if (!stream) {
            console.log('no stream in handleVideoCallButtonClick');
            return;
        }

        const participants = { caller: currentSocketUser, receiver: user }
        setOngoingCall({
            participants,
            isRinging: false
        })
        socket?.emit('call', participants)
    }, [socket, currentSocketUser, ongoingCall])

    const handleJoinCall = useCallback(async (ongoingCall: OngoingCall) => {
        setIsCallEnded(false)
        setOngoingCall(prev => {
            if (prev) {
                return { ...prev, isRinging: false }
            } else return prev
        })
        const stream = await getMediaStream()
        if (!stream) {
            console.log('Could not get stream')
            return
        }

        const newPeer = createPeer(stream!, true, ongoingCall.participants.caller);

        setPeer({
            peerConnection: newPeer,
            participantUser: ongoingCall.participants.caller,
            stream: undefined
        });

        newPeer.on('signal', async (data: SignalData) => {
            if (socket) {
                console.log('emit offer to participant');
                socket.emit('webrtcSignal', {
                    sdp: data,
                    ongoingCall,
                    isCaller: false
                });
            }
        });
    }, [socket, currentSocketUser])

    const handleHangup = useCallback((data: { ongoingCall?: OngoingCall | null, callEnded?: boolean }) => {
        if (socket && user && data?.ongoingCall && !data?.callEnded) {
            socket.emit('hangup', {
                ongoingCall: data.ongoingCall,
                userHangingupId: user.id
            })
        }

        setOngoingCall(null)
        setPeer(null)
        if (localStream) {
            localStream.getTracks().forEach((track => track.stop()))
            setLocalStream(null)
        }
        setIsCallEnded(true)
    }, [socket, user, localStream])

    // --- chat ---
    const sendMessage = useCallback((message: string, to?: string, file?: { name: string, type: string, data: string }) => {
        if (!socket || !user) return;
        const msg: ChatMessage = {
            from: user.id,
            to,
            message,
            timestamp: Date.now(),
        };
        if (file) {
            msg.fileName = file.name;
            msg.fileType = file.type;
            msg.fileData = file.data;
        }
        socket.emit('chat:message', msg);
    }, [socket, user]);

    useEffect(() => {
        if (!socket) return;
        const handler = (msg: ChatMessage) => {
            setChatMessages((prev) => [...prev, msg]);
        };
        socket.on('chat:message', handler);
        return () => {
            socket.off('chat:message', handler);
        };
    }, [socket]);

    // initialize socket
    useEffect(() => {
        const newSocket = io('http://localhost:3000');
        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [user]);

    useEffect(() => {
        if (socket === null) return;

        if (socket.connected) {
            onConnect();
        }

        function onConnect() {
            if (socket) {
                setIsConnected(true);
            }
        }

        function onDisconnect() {
            setIsConnected(false);
        }

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);

        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
        };
    }, [socket]);

    // set online users
    useEffect(() => {
        if (!socket || !isConnected) return;

        socket.emit("addNewUser", user);
        socket.on("getUsers", (res) => {
            setOnlineUsers(res);
        });

        return () => {
            socket.off("getUsers");
        };
    }, [socket, isConnected, user]);

    // calls
    useEffect(() => {
        if (!socket || !isConnected) return;

        socket.on("incomingCall", onIncomingCall);
        socket.on('webrtcSignal', completePeerConnection);
        socket.on('hangup', () => {
            setOngoingCall(null);
            setPeer(null);
            setIsCallEnded(true);
            if (localStream) {
                localStream.getTracks().forEach((track) => track.stop());
                setLocalStream(null);
            }
        });

        return () => {
            socket.off("incomingCall", onIncomingCall);
            socket.off('webrtcSignal', completePeerConnection);
            socket.off('hangup');
        };
    }, [socket, isConnected, user, onIncomingCall, completePeerConnection, localStream]);

    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout>;
        if (isCallEnded) {
            timeout = setTimeout(() => {
                setIsCallEnded(false);
            }, 2000);
        }

        return () => clearTimeout(timeout);
    }, [isCallEnded]);

    return (
        <SocketContext.Provider value={{
            socket,
            onlineUsers,
            ongoingCall,
            localStream,
            peer,
            isCallEnded,
            handleCall,
            handleJoinCall,
            handleHangup,
            // --- chat ---
            chatMessages,
            sendMessage,
        }}>
            {props.children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);

    if (context === null) {
        throw new Error("useCart must be used within a CartContextProvider");
    }

    return context;
};
