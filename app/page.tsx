"use client";

import CallNotification from "@/components/CallNotification";
import VideoCall from "@/components/VideoCall";
import ListOnlineUsers from "@/components/ListOnlineUsers";
import Chat from '@/components/Chat';
import { useState } from 'react';
import { useSocket } from '@/context/SocketContext';

export default function HomePage() {
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const { handleCall, ongoingCall } = useSocket();

  const handleSelectUser = (user: any) => {
    setSelectedUser(user);
  };

  const handleVideoCall = () => {
    if (selectedUser) handleCall(selectedUser);
  };

  const handleAudioCall = () => {
    // TODO: реализовать аудиозвонок (аналогично handleCall, но только аудио)
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <CallNotification />
      <VideoCall />
      {!selectedUser ? (
        <ListOnlineUsers onSelectUser={handleSelectUser} />
      ) : (
        !ongoingCall && (
          <div className="w-full max-w-md">
            <button className="mb-2 text-xs text-blue-600 underline" onClick={() => setSelectedUser(null)}>
              ← Назад к списку пользователей
            </button>
            <Chat userTo={selectedUser} onCall={handleVideoCall} onAudioCall={handleAudioCall} />
          </div>
        )
      )}
    </div>
  );
}
