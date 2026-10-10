// 各アカウントの Apps Script「ウェブアプリのURL」を入れる（構築手順書 6.2-8）
// リンクIDの頭文字（w- / h- / p-）で、どこに問い合わせるかが決まる
window.YOYAKU_CONFIG = {
  backends: {
    w: 'https://script.google.com/macros/s/AKfycbz-dTZPKPmkAERR00WC7BUvczbQ_GAelFGe25JSGPHRu3SUL1DUu6lJwiT6rjDqX37y/exec', // ウィンスリー（h.miyazaki@w3hr.jp）
    h: 'https://script.google.com/macros/s/AKfycbyAlfJdo57jrznkaT78R2ywzBHpVZbHzYnlFd5xhN6ca1FMnPWsjYyAHxvEkyT3_wiX/exec', // HotSpring（hiroshi.miyazaki@hotspring7.com）
    p: 'https://script.google.com/macros/s/AKfycbwfIH2Fn4wD5lUVAQ_CcLe7huDwD_eO6brMTFi47_Jfe2vTUX4oP71ugHWFxS2_AMGvMQ/exec'  // プライベート（hiroshi.miyazaki1@gmail.com）
  }
};
