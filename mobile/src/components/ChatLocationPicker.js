// ============================================================
// ChatLocationPicker — Modal chọn vị trí cho AI Chatbot (native).
// Wrap MapPickerModal để ChatbotScreen dùng đúng API cần:
//   onPick({ latitude, longitude, label })  onClose()
// (Web dùng ChatLocationPicker.web.js — geocode search không cần WebView.)
// ============================================================

import React from 'react';
import MapPickerModal from './MapPickerModal';

export default function ChatLocationPicker({ visible, onPick, onClose }) {
  return (
    <MapPickerModal
      visible={visible}
      onPick={({ latitude, longitude, address }) =>
        onPick?.({ latitude, longitude, label: address })}
      onClose={onClose}
    />
  );
}
