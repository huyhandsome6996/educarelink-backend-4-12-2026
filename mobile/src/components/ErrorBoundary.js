// ============================================================
// ErrorBoundary — bắt mọi lỗi render trong app và hiển thị thay vì đen màn
// ============================================================
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Button } from 'react-native';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const err = this.state.error || {};
      const stack = (this.state.errorInfo && this.state.errorInfo.componentStack) || '';
      const msg = (err && err.message) ? err.message : String(err);
      const errStack = (err && err.stack) ? err.stack : '';

      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>EduCareLink — Lỗi khởi động</Text>
            <Text style={styles.subtitle}>App gặp lỗi khi render. Vui lòng gửi ảnh chụp này cho team dev.</Text>
            <Text style={styles.errorMsg}>{msg}</Text>
            {errStack ? (
              <>
                <Text style={styles.sectionTitle}>Stack:</Text>
                <Text style={styles.stack}>{errStack}</Text>
              </>
            ) : null}
            {stack ? (
              <>
                <Text style={styles.sectionTitle}>Component stack:</Text>
                <Text style={styles.stack}>{stack}</Text>
              </>
            ) : null}
          </ScrollView>
          <View style={styles.buttonWrap}>
            <Button title="Thử lại" onPress={this.handleReload} color="#F26522" />
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F0',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  scroll: {
    paddingBottom: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#A63B00',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#594138',
    marginBottom: 16,
  },
  errorMsg: {
    fontSize: 14,
    color: '#B91C1C',
    fontFamily: 'monospace',
    backgroundColor: '#FFE4E4',
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#261813',
    marginTop: 12,
    marginBottom: 6,
  },
  stack: {
    fontSize: 11,
    color: '#444',
    fontFamily: 'monospace',
    backgroundColor: '#F3F3F3',
    padding: 8,
    borderRadius: 4,
  },
  buttonWrap: {
    paddingVertical: 12,
  },
});
