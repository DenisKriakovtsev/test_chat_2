import { useContext, useRef, useEffect, useState } from 'react';
import { SocketContext, ChatMessage } from '@/context/SocketContext';
import { useUser } from '@clerk/nextjs';
import { Button } from './ui/button';

const Chat = ({ userTo, onCall, onAudioCall }: { userTo: any, onCall?: () => void, onAudioCall?: () => void }) => {
  const socketCtx = useContext(SocketContext);
  const { user, isLoaded } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSendingFile, setIsSendingFile] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);



  if (!isLoaded || !user || !userTo || !socketCtx){
    return null;
  }
  const { chatMessages, sendMessage } = socketCtx;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (chatMessages) {
      messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }
  }, [chatMessages]);


  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRecording && mediaRecorder) {
      // Завершаем запись и отправляем аудио
      console.log('Завершаем запись по кнопке Отправить');
      mediaRecorder.stop();
      setIsRecording(false);
      return;
    }
    const value = inputRef.current?.value?.trim();
    if (selectedFile) {
      setIsSendingFile(true);
      const file = selectedFile;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result?.toString().split(',')[1];
        if (base64) {
          sendMessage(value || '', userTo.profile.id, {
            name: file.name,
            type: file.type,
            data: base64,
          });
        }
        setIsSendingFile(false);
        setSelectedFile(null);
        if (inputRef.current) inputRef.current.value = '';
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
      return;
    }
    if (value) {
      sendMessage(value, userTo.profile.id);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  // --- Голосовые сообщения ---
  const handleRecordAudio = async () => {
    if (isRecording) {
      mediaRecorder?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new window.MediaRecorder(stream);
      let chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
          console.log('ondataavailable', e.data);
        }
      };
      recorder.onstop = () => {
        console.log('onstop, chunks:', chunks);
        if (chunks.length === 0) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result?.toString().split(',')[1];
          if (base64) {
            sendMessage('', userTo.profile.id, {
              name: `voice-message-${Date.now()}.webm`,
              type: 'audio/webm',
              data: base64,
            });
            console.log('Отправлено аудио base64 длина:', base64.length);
          } else {
            console.log('base64 пустой');
          }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      setIsRecording(true);
      setMediaRecorder(recorder);
      console.log('Начата запись аудио');
    } catch (err) {
      alert('Не удалось получить доступ к микрофону');
    }
  };

  const renderMessage = (msg: ChatMessage, idx: number) => {
    const isOwn = msg.from === user.id;
    return (
      <div key={idx} className={`mb-1 flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className={`px-3 py-1 rounded-lg text-sm max-w-[80%] ${isOwn ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-900'}`}>
          {msg.message && <div>{msg.message}</div>}
          {msg.fileData && msg.fileType?.startsWith('image/') && (
            <img
              src={`data:${msg.fileType};base64,${msg.fileData}`}
              alt={msg.fileName || 'file'}
              className="mt-1 max-w-xs max-h-40 rounded border"
            />
          )}
          {msg.fileData && msg.fileType?.startsWith('audio/') && (
            <audio
              controls
              src={`data:${msg.fileType};base64,${msg.fileData}`}
              className="mt-1 w-full min-w-[200px] max-w-xs"
            >
              Ваш браузер не поддерживает аудио.
            </audio>
          )}
          {msg.fileData && !msg.fileType?.startsWith('image/') && !msg.fileType?.startsWith('audio/') && (
            <a
              href={`data:${msg.fileType};base64,${msg.fileData}`}
              download={msg.fileName}
              className="mt-1 block underline text-xs text-blue-900"
            >
              {msg.fileName || 'Скачать файл'}
            </a>
          )}
        </div>
      </div>
    );
  };

  // фильтруем только сообщения между текущим пользователем и userTo
  const filteredMessages = chatMessages.filter(
    (msg) =>
      (msg.from === user.id && msg.to === userTo.profile.id) ||
      (msg.from === userTo.profile.id && msg.to === user.id)
  );

  return (
    <div className="flex flex-col h-80 w-full max-w-md min-w-[320px] border rounded bg-white/80 shadow p-2">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-base flex items-center gap-2">
          <span>{userTo.profile.fullName}</span>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCall}>Позвонить</Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto mb-2">
        {filteredMessages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSend} className="flex gap-2 items-center">
        <input
          ref={inputRef}
          type="text"
          placeholder="Введите сообщение..."
          className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none"
          disabled={isSendingFile || isRecording}
        />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSendingFile || isRecording}
        >
          📎
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isRecording ? 'destructive' : 'outline'}
          onClick={handleRecordAudio}
          disabled={isSendingFile}
        >
          {isRecording ? '■' : '🎤'}
        </Button>
        <Button type="submit" size="sm" disabled={isSendingFile || isRecording}>
          {isSendingFile ? 'Отправка...' : 'Отправить'}
        </Button>
      </form>
      {selectedFile && (
        <div className="mt-1 text-xs text-gray-700 truncate">Файл: {selectedFile.name}</div>
      )}
      {isRecording && (
        <div className="mt-1 text-xs text-red-600">Идёт запись...</div>
      )}
    </div>
  );
};

export default Chat; 