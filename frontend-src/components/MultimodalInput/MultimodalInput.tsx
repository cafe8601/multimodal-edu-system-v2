import React, { useState, useRef } from 'react';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Button,
  Stack,
  Typography,
  CircularProgress,
  Chip
} from '@mui/material';
import {
  Send as SendIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Image as ImageIcon,
  AttachFile as FileIcon,
  Clear as ClearIcon
} from '@mui/icons-material';

interface MultimodalInputProps {
  onSubmit: (input: MultimodalInputData) => void;
  disabled?: boolean;
}

export interface MultimodalInputData {
  text?: string;
  audio?: Blob;
  image?: File;
  document?: File;
  type: 'text' | 'audio' | 'image' | 'document' | 'mixed';
}

export const MultimodalInput: React.FC<MultimodalInputProps> = ({
  onSubmit,
  disabled = false
}) => {
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleTextSubmit = () => {
    if (textInput.trim() || audioBlob || imageFile || documentFile) {
      const inputData: MultimodalInputData = {
        text: textInput.trim(),
        audio: audioBlob || undefined,
        image: imageFile || undefined,
        document: documentFile || undefined,
        type: determineInputType()
      };
      
      onSubmit(inputData);
      clearInputs();
    }
  };

  const determineInputType = (): MultimodalInputData['type'] => {
    const hasMultiple = [textInput.trim(), audioBlob, imageFile, documentFile]
      .filter(Boolean).length > 1;
    
    if (hasMultiple) return 'mixed';
    if (textInput.trim()) return 'text';
    if (audioBlob) return 'audio';
    if (imageFile) return 'image';
    if (documentFile) return 'document';
    return 'text';
  };

  const clearInputs = () => {
    setTextInput('');
    setAudioBlob(null);
    setImageFile(null);
    setDocumentFile(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
    }
  };

  const handleDocumentUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setDocumentFile(file);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 2 }}>
      <Stack spacing={2}>
        {/* Attached files display */}
        <Box display="flex" gap={1} flexWrap="wrap">
          {audioBlob && (
            <Chip
              label="Audio recording"
              onDelete={() => setAudioBlob(null)}
              color="primary"
              size="small"
            />
          )}
          {imageFile && (
            <Chip
              label={`Image: ${imageFile.name}`}
              onDelete={() => setImageFile(null)}
              color="secondary"
              size="small"
            />
          )}
          {documentFile && (
            <Chip
              label={`Document: ${documentFile.name}`}
              onDelete={() => setDocumentFile(null)}
              color="info"
              size="small"
            />
          )}
        </Box>

        {/* Input area */}
        <Box display="flex" alignItems="flex-end" gap={1}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && \!e.shiftKey) {
                e.preventDefault();
                handleTextSubmit();
              }
            }}
            placeholder="Type your message or attach files..."
            disabled={disabled || isProcessing}
            variant="outlined"
          />

          {/* Action buttons */}
          <Stack direction="row" spacing={1}>
            {/* Voice recording */}
            <IconButton
              onClick={isRecording ? stopRecording : startRecording}
              color={isRecording ? "error" : "default"}
              disabled={disabled}
            >
              {isRecording ? <MicOffIcon /> : <MicIcon />}
            </IconButton>

            {/* Image upload */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleImageUpload}
            />
            <IconButton
              onClick={() => imageInputRef.current?.click()}
              disabled={disabled}
            >
              <ImageIcon />
            </IconButton>

            {/* Document upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              hidden
              onChange={handleDocumentUpload}
            />
            <IconButton
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <FileIcon />
            </IconButton>

            {/* Send button */}
            <IconButton
              onClick={handleTextSubmit}
              color="primary"
              disabled={disabled || isProcessing || (\!textInput.trim() && \!audioBlob && \!imageFile && \!documentFile)}
            >
              {isProcessing ? <CircularProgress size={24} /> : <SendIcon />}
            </IconButton>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
};
