import apiClient from './client';

// Đăng nhập — trả về token + role
export const login = (username, password) =>
  apiClient.post('/auth/login/', { username, password });

// Đăng ký tài khoản mới (hỗ trợ upload ảnh cho Carepartner)
export const register = (username, password, role, firstName = '', lastName = '', email = '', phone = '', idCardFront = null, idCardBack = null, selfiePhoto = null, certificatePhoto = null) => {
  // Nếu có file ảnh → dùng FormData (multipart)
  if (idCardFront || idCardBack || selfiePhoto || certificatePhoto) {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    formData.append('role', role);
    formData.append('first_name', firstName);
    formData.append('last_name', lastName);
    if (email) formData.append('email', email);
    if (phone) formData.append('phone_number', phone);

    if (idCardFront) {
      formData.append('id_card_front', {
        uri: idCardFront.uri,
        type: idCardFront.mimeType || 'image/jpeg',
        name: 'id_card_front.jpg',
      });
    }
    if (idCardBack) {
      formData.append('id_card_back', {
        uri: idCardBack.uri,
        type: idCardBack.mimeType || 'image/jpeg',
        name: 'id_card_back.jpg',
      });
    }
    if (selfiePhoto) {
      formData.append('selfie_photo', {
        uri: selfiePhoto.uri,
        type: selfiePhoto.mimeType || 'image/jpeg',
        name: 'selfie_photo.jpg',
      });
    }
    if (certificatePhoto) {
      formData.append('certificate_photo', {
        uri: certificatePhoto.uri,
        type: certificatePhoto.mimeType || 'image/jpeg',
        name: 'certificate_photo.jpg',
      });
    }

    return apiClient.post('/auth/register/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  // Phụ huynh — JSON đơn giản
  return apiClient.post('/auth/register/', {
    username,
    password,
    role,
    first_name: firstName,
    last_name: lastName,
    email,
    phone_number: phone,
  });
};

// Lấy thông tin hồ sơ người dùng hiện tại
export const getProfile = () => apiClient.get('/profile/');

// Cập nhật chứng chỉ sau khi đã đăng nhập
export const updateCertificate = (certificatePhoto) => {
  const formData = new FormData();
  if (certificatePhoto) {
    formData.append('certificate_photo', {
      uri: certificatePhoto.uri,
      type: certificatePhoto.mimeType || 'image/jpeg',
      name: 'certificate_photo.jpg',
    });
  }
  return apiClient.patch('/profile/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
