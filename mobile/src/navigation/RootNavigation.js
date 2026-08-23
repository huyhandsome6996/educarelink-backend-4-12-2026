// ====================================================================
// RootNavigation — imperative navigation handle cho code ngoài cây React
// ====================================================================
// N — chat push: App.js notification listener cần navigate('Chat') khi nhận
// push new_chat_message nhưng không có access đến navigation prop (listener
// nằm ngoài NavigationContainer). Pattern chuẩn React Navigation: NavigationContainer
// gắn ref vào đây, module này export getRootNavigator() cho listener dùng.
//
// Nếu navigator chưa mount (splash/loading) → getRootNavigator() trả undefined,
// caller tự xử lý (catch silent — user vẫn thấy notification banner hệ thống).
// ====================================================================

let _rootNavigator = null;

export function setRootNavigator(navigator) {
  _rootNavigator = navigator;
}

export function getRootNavigator() {
  return _rootNavigator;
}
