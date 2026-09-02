/**
 * FormattedText — Render text AI response với format: gạch đầu dòng, **bold**, headings.
 *
 * Hỗ trợ:
 * - `**text**` → bold
 * - `*text*` → italic
 * - Dòng bắt đầu bằng `•`, `-`, `*` → bullet point (indent + icon)
 * - Dòng bắt đầu bằng số `1.`, `2.` → numbered list
 * - Dòng bắt đầu bằng `###` → heading
 * - `\n` → xuống dòng
 *
 * Usage:
 *   <FormattedText text="• Mục 1\n• Mục 2" style={styles.text} />
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, TYPO } from '../theme/colors';

const FormattedText = ({ text, style, baseColor }) => {
  if (!text) return null;

  const textColor = baseColor || style?.color || COLORS.textPrimary;

  // Split text thành các dòng
  const lines = text.split('\n');

  const renderInline = (str, keyPrefix) => {
    // Parse **bold** và *italic*
    const parts = [];
    let remaining = str;
    let keyIdx = 0;

    while (remaining.length > 0) {
      // Bold **text**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Italic *text* (single asterisk, không phải **)
      const italicMatch = remaining.match(/\*(.+?)\*/);

      if (boldMatch && (!italicMatch || boldMatch.index <= italicMatch.index)) {
        const before = remaining.substring(0, boldMatch.index);
        if (before) parts.push(<Text key={`${keyPrefix}-${keyIdx++}`} style={style}>{before}</Text>);
        parts.push(<Text key={`${keyPrefix}-${keyIdx++}`} style={[style, { fontWeight: '700' }]}>{boldMatch[1]}</Text>);
        remaining = remaining.substring(boldMatch.index + boldMatch[0].length);
      } else if (italicMatch) {
        const before = remaining.substring(0, italicMatch.index);
        if (before) parts.push(<Text key={`${keyPrefix}-${keyIdx++}`} style={style}>{before}</Text>);
        parts.push(<Text key={`${keyPrefix}-${keyIdx++}`} style={[style, { fontStyle: 'italic' }]}>{italicMatch[1]}</Text>);
        remaining = remaining.substring(italicMatch.index + italicMatch[0].length);
      } else {
        parts.push(<Text key={`${keyPrefix}-${keyIdx++}`} style={style}>{remaining}</Text>);
        remaining = '';
      }
    }
    return parts;
  };

  return (
    <View style={styles.container}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // Dòng trống
        if (!trimmed) {
          return <View key={`empty-${idx}`} style={styles.emptyLine} />;
        }

        // Heading ### 
        if (trimmed.startsWith('### ')) {
          return (
            <Text key={`h3-${idx}`} style={[style, styles.heading]}>
              {renderInline(trimmed.substring(4), `h3-${idx}`)}
            </Text>
          );
        }

        // Bullet • - *
        if (/^[•\-\*]\s+/.test(trimmed)) {
          const content = trimmed.replace(/^[•\-\*]\s+/, '');
          return (
            <View key={`bullet-${idx}`} style={styles.bulletRow}>
              <Text style={[style, styles.bulletIcon, { color: textColor }]}>•</Text>
              <Text style={[style, styles.bulletText]}>
                {renderInline(content, `b-${idx}`)}
              </Text>
            </View>
          );
        }

        // Numbered 1. 2. 3.
        const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (numMatch) {
          return (
            <View key={`num-${idx}`} style={styles.bulletRow}>
              <Text style={[style, styles.bulletIcon, { color: textColor }]}>{numMatch[1]}.</Text>
              <Text style={[style, styles.bulletText]}>
                {renderInline(numMatch[2], `n-${idx}`)}
              </Text>
            </View>
          );
        }

        // Plain line
        return (
          <Text key={`line-${idx}`} style={style}>
            {renderInline(trimmed, `l-${idx}`)}
          </Text>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 4 },
  emptyLine: { height: 6 },
  heading: {
    fontWeight: '700',
    fontSize: 15,
    marginTop: 6,
    marginBottom: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 4,
    paddingVertical: 1,
  },
  bulletIcon: {
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
    minWidth: 14,
  },
  bulletText: {
    flex: 1,
    lineHeight: 20,
  },
});

export default FormattedText;
