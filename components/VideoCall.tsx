'use client'

import { useSocket } from "@/context/SocketContext";
import VideoContainer from "./VideoContainer";
import { MdMic, MdMicOff, MdVideocam, MdVideocamOff } from "react-icons/md";
import { useState, useRef } from "react";
import Chat from "./Chat";
import { useUser } from "@clerk/nextjs";

const VideoCall = () => {
    const { localStream, peer, isCallEnded, ongoingCall, handleHangup } = useSocket()
    const { user } = useUser();
    const [isMicOn, setIsMicOn] = useState(true)
    const [isVidOn, setIsVidOn] = useState(true)
    // --- запись звонка ---
    const [isRecording, setIsRecording] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    // Определяем userTo для чата (второй участник звонка)
    let userTo = null;
    if (ongoingCall && user) {
        if (ongoingCall.participants.caller.userId === user.id) {
            userTo = ongoingCall.participants.receiver;
        } else {
            userTo = ongoingCall.participants.caller;
        }
    }

    const startRecording = () => {
        // Если есть оба потока — объединяем их
        if (localStream && peer?.stream) {
            // 1. Создаём скрытые видео-элементы
            const localVideo = document.createElement('video');
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.play();

            const remoteVideo = document.createElement('video');
            remoteVideo.srcObject = peer.stream;
            remoteVideo.muted = true;
            remoteVideo.play();

            // 2. Создаём canvas с расстоянием между видео
            const gap = 32; // px, красивое расстояние между видео
            const videoWidth = 640;
            const videoHeight = 480;
            const canvas = document.createElement('canvas');
            canvas.width = videoWidth * 2 + gap;
            canvas.height = videoHeight;
            const ctx = canvas.getContext('2d');

            // Для подписей
            const localName = user?.firstName || user?.username || "Вы";
            const remoteName = userTo?.profile?.firstName || userTo?.profile?.username || "Собеседник";
            const labelFont = "bold 22px Arial";
            const labelColor = "#fff";
            const labelBg = "rgba(0,0,0,0.7)";
            const labelHeight = 32;

            // 3. Рисуем оба видео на canvas с отступом и подписями
            let animationFrameId: number;
            const drawFrame = () => {
                if (ctx) {
                    // Чёрный фон
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    // Левое видео
                    ctx.drawImage(localVideo, 0, 0, videoWidth, videoHeight);
                    // Подпись под левым видео
                    ctx.fillStyle = labelBg;
                    ctx.fillRect(0, videoHeight - labelHeight, videoWidth, labelHeight);
                    ctx.font = labelFont;
                    ctx.fillStyle = labelColor;
                    ctx.textAlign = "center";
                    ctx.fillText(localName, videoWidth / 2, videoHeight - 8);
                    // Правое видео с отступом
                    ctx.drawImage(remoteVideo, videoWidth + gap, 0, videoWidth, videoHeight);
                    // Подпись под правым видео
                    ctx.fillStyle = labelBg;
                    ctx.fillRect(videoWidth + gap, videoHeight - labelHeight, videoWidth, labelHeight);
                    ctx.font = labelFont;
                    ctx.fillStyle = labelColor;
                    ctx.textAlign = "center";
                    ctx.fillText(remoteName, videoWidth + gap + videoWidth / 2, videoHeight - 8);
                }
                animationFrameId = requestAnimationFrame(drawFrame);
            };
            drawFrame();

            // 4. Захватываем поток с canvas
            const canvasStream = canvas.captureStream(30);

            // 5. Объединяем аудио-дорожки
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioCtx();
            const destination = audioContext.createMediaStreamDestination();

            // local audio
            if (localStream.getAudioTracks().length > 0) {
                const localSource = audioContext.createMediaStreamSource(new MediaStream([localStream.getAudioTracks()[0]]));
                localSource.connect(destination);
            }
            // remote audio
            if (peer.stream.getAudioTracks().length > 0) {
                const remoteSource = audioContext.createMediaStreamSource(new MediaStream([peer.stream.getAudioTracks()[0]]));
                remoteSource.connect(destination);
            }

            // 6. Добавляем аудио к canvasStream
            destination.stream.getAudioTracks().forEach(track => {
                canvasStream.addTrack(track);
            });

            // 7. Запускаем MediaRecorder
            const recorder = new MediaRecorder(canvasStream);
            chunksRef.current = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };
            recorder.onstop = () => {
                cancelAnimationFrame(animationFrameId);
                const blob = new Blob(chunksRef.current, { type: "video/webm" });
                setDownloadUrl(URL.createObjectURL(blob));
                audioContext.close();
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
            return;
        }
        // Fallback: только localStream (старый режим)
        if (localStream) {
            chunksRef.current = [];
            const recorder = new MediaRecorder(localStream);
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: "video/webm" });
                setDownloadUrl(URL.createObjectURL(blob));
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    };
    // --- конец записи ---

    if (isCallEnded) {
        return <div className=" mt-5 text-rose-500">Call Ended</div>
    }

    if (!localStream && !peer) return;

    const toggleCamera = () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            videoTrack.enabled = !videoTrack.enabled;
            setIsVidOn(videoTrack.enabled)
        }
    };

    const toggleAudio = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            setIsMicOn(audioTrack.enabled)
        }
    };

    const isOnCall = localStream && peer && ongoingCall ? true : false

    return (
        <>
            <div className="mt-4 relative]">
                {localStream && <VideoContainer stream={localStream} isLocalStream={true} isOnCall={isOnCall} />}
                {peer && peer.stream && <VideoContainer stream={peer.stream} isLocalStream={false} isOnCall={isOnCall} />}
            </div>
            <div className="mt-8 flex items-center gap-4">
                <button onClick={toggleAudio}>
                    {!isMicOn && <MdMic size={28} />}
                    {isMicOn && <MdMicOff size={28} />}
                </button>
                <button className="px-4 py-2 bg-rose-500 text-white rounded mx-4" onClick={() => handleHangup({ ongoingCall: ongoingCall ? ongoingCall : undefined })}>End Call</button>
                <button onClick={toggleCamera}>
                    {!isVidOn && <MdVideocam size={28} />}
                    {isVidOn && <MdVideocamOff size={28} />}
                </button>
                {/* Кнопки записи */}
                {!isRecording ? (
                    <button className="px-3 py-2 bg-green-500 text-white rounded" onClick={startRecording} disabled={!localStream}>
                        Начать запись
                    </button>
                ) : (
                    <button className="px-3 py-2 bg-yellow-500 text-white rounded" onClick={stopRecording}>
                        Остановить запись
                    </button>
                )}
                {/* Ссылка на скачивание */}
                {downloadUrl && (
                    <a
                        href={downloadUrl}
                        download="call_recording.webm"
                        className="ml-2 px-3 py-2 bg-blue-500 text-white rounded"
                    >
                        Скачать запись
                    </a>
                )}
            </div>
            <div className="mt-6 flex justify-center">
                {userTo && <Chat userTo={userTo} />}
            </div>
        </>
    );
}

export default VideoCall;