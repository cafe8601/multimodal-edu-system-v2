import React from 'react';
import { Box, Typography, IconButton, Paper } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

interface FilePreviewProps {
  file: File;
  onRemove: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ file, onRemove }) => {
  const isImage = file.type.startsWith('image/');
  const [preview, setPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isImage) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, [file, isImage]);

  return (
    <Paper
      elevation={1}
      sx={{
        p: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        maxWidth: 200
      }}
    >
      {isImage && preview ? (
        <Box
          component="img"
          src={preview}
          alt={file.name}
          sx={{
            width: 60,
            height: 60,
            objectFit: 'cover',
            borderRadius: 1
          }}
        />
      ) : (
        <Box
          sx={{
            width: 60,
            height: 60,
            bgcolor: 'grey.200',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 1
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {file.name.split('.').pop()?.toUpperCase()}
          </Typography>
        </Box>
      )}
      
      <Box flex={1} minWidth={0}>
        <Typography variant="body2" noWrap>
          {file.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {(file.size / 1024).toFixed(1)} KB
        </Typography>
      </Box>
      
      <IconButton size="small" onClick={onRemove}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Paper>
  );
};
