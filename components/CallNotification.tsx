'use client'

import { useSocket } from "@/context/SocketContext";
import { MdCall, MdCallEnd } from "react-icons/md";
import Avatar from "./layout/Avatar";
import { useEffect, useRef, useState } from "react";

const CallNotification = () => {
    const { ongoingCall, handleJoinCall, handleHangup } = useSocket();
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [audioBlocked, setAudioBlocked] = useState(false);
    const [audioActivated, setAudioActivated] = useState(
        typeof window !== 'undefined' && window.localStorage.getItem('audioActivated') === 'true'
    );

    useEffect(() => {
        if (ongoingCall?.isRinging && audioActivated) {
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch((err) => {
                    console.error('Ошибка воспроизведения аудио:', err);
                    setAudioBlocked(true);
                });
            }
        } else {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        }
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        };
    }, [ongoingCall?.isRinging, audioActivated]);

    // Функция для ручного запуска звука и активации аудио для всех звонков
    const handleActivateAudio = () => {
        if (audioRef.current) {
            audioRef.current.play();
        }
        setAudioBlocked(false);
        setAudioActivated(true);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('audioActivated', 'true');
        }
    };

    useEffect(() => {
        if (ongoingCall?.isRinging && typeof window !== 'undefined' && "Notification" in window) {
            if (Notification.permission === "default") {
                Notification.requestPermission();
            }
            if (Notification.permission === "granted") {
                new Notification("Вам звонят!", {
                    body: `Звонит: ${ongoingCall.participants.caller.profile.fullName || "Пользователь"}`,
                    icon: "/favicon.ico"
                });
            }
        }
    }, [ongoingCall?.isRinging, ongoingCall?.participants?.caller?.profile?.fullName]);

    if (!ongoingCall?.isRinging) return null;

    return (
        <div className="fixed inset-0 z-[99999999] bg-slate-500 bg-opacity-70 flex items-center justify-center overflow-hidden">
            <div className="bg-white w-full max-w-xs min-h-[120px] flex flex-col items-center justify-center rounded-lg p-6 shadow-xl">
                <div className="flex flex-col items-center">
                    <Avatar src={ongoingCall.participants.caller.profile.imageUrl} />
                    <h3 className="mt-2 text-lg font-semibold text-gray-900">{ongoingCall.participants.caller.profile.fullName?.split(' ')[0]}</h3>
                </div>
                <p className="text-sm mb-4 mt-2 text-gray-700">Incoming Call</p>
                <div className="flex gap-8 mb-2">
                    <button className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white shadow" onClick={() => handleJoinCall(ongoingCall)}><MdCall size={28} /></button>
                    <button className="w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center text-white shadow" onClick={() => handleHangup({ ongoingCall })}><MdCallEnd size={28} /></button>
                </div>
                {/* Скрытый аудиоплеер для звонка */}
                <audio
                    ref={audioRef}
                    src="/ringtone.mp3"
                    preload="auto"
                    onError={() => console.error('Ошибка загрузки ringtone.mp3')}
                />
                {audioBlocked && (
                    <button
                        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
                        onClick={handleActivateAudio}
                    >
                        Включить звук звонка
                    </button>
                )}
            </div>
        </div>
    );
};

export default CallNotification;