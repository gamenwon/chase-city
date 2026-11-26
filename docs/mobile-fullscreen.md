# 모바일 전체 화면 · 환경별 지원 정리

게임 쪽에서 들어간 것 (v27 모바일 테스트 빌드):

- **전체 화면 버튼**: 시작 화면·일시정지 메뉴의 "설정 → 전체 화면".
- **자동 전체 화면**: 폰에서 START를 누르면 한 번 전체 화면을 요청합니다. 사용자가 전체 화면을 끈 뒤에는 다시 요청하지 않습니다.
- **홈 화면 앱 실행**: `manifest.webmanifest`(display: fullscreen, orientation: any)와 iOS용 `apple-mobile-web-app-*` 메타 태그를 넣었습니다. "홈 화면에 추가"로 실행하면 주소창 없이 열립니다.
- **회전**: 가로·세로를 돌려도 크기만 다시 맞추고 게임 상태는 그대로 유지합니다.
- **여백 없음**: `viewport-fit=cover`로 화면 전체(노치 영역 포함)에 게임을 그리고, HUD만 안전 영역 안쪽에 둡니다.
- **안내 문구**: 전체 화면을 쓸 수 없는 환경에서는 설정 메뉴에 이유와 방법을 표시합니다.

## 환경별

| 환경 | 페이지 전체 화면 (Fullscreen API) | 주소창 없이 플레이하는 방법 |
|---|---|---|
| Android Chrome · 삼성 인터넷 | 지원 (주소창·내비게이션 바 숨김) | START 또는 설정 버튼 / 홈 화면에 추가 |
| iPhone Safari (iOS) | **미지원** (영상만 가능) | **공유 → "홈 화면에 추가"** 후 아이콘으로 실행 |
| iPad Safari (iPadOS) | 지원 | START 또는 설정 버튼 |
| Claude 앱 · claude.ai 미리보기 | 미리보기 프레임이 허용할 때만 가능 (확인 필요) | 상단 X·공유 바는 미리보기 앱의 UI라 게임에서 없앨 수 없음 → 별도 주소로 배포 필요 |
| 회사 앱 Android WebView | 앱이 허용해야 함 (아래) | 앱이 WebView를 전체 화면 액티비티로 띄우면 됨 |
| 회사 앱 iOS WKWebView | 페이지에서는 불가 | 앱이 WebView를 전체 화면 뷰로 띄우면 됨 |

### 상단 X·공유 버튼 없이 테스트하려면

지금 테스트 URL(claude.ai 아티팩트)은 Claude 미리보기 화면 안에서 열립니다. 그래서 위쪽의 X·공유 바는 게임이 숨길 수 없습니다. 바 없이 테스트하려면 빌드 결과(`dist/`)를 별도의 정적 주소에 올려야 합니다. 예: 회사 서버, GitHub Pages 같은 정적 호스팅.

- 그 주소를 폰 브라우저나 회사 앱 WebView에서 직접 엽니다.
- Android는 START만 눌러도 전체 화면이 됩니다. iPhone은 "홈 화면에 추가"를 쓰면 됩니다.

### 회사 앱 Android WebView (앱 개발 측 설정)

- **화면 회전 시 리로드 방지 (중요)**: 액티비티에 `android:configChanges="orientation|screenSize|screenLayout|keyboardHidden"`를 지정합니다. 없으면 회전할 때 액티비티가 다시 만들어져 WebView가 새로고침되고, 게임이 처음으로 돌아갑니다.
- **회전 허용**: `android:screenOrientation="fullSensor"`(또는 지정하지 않음)로 가로·세로 모두 허용합니다.
- **전체 화면**: 몰입 모드로 상태 바와 내비게이션 바를 숨깁니다.
  ```kotlin
  WindowCompat.setDecorFitsSystemWindows(window, false)
  WindowInsetsControllerCompat(window, window.decorView).apply {
      hide(WindowInsetsCompat.Type.systemBars())
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
  }
  ```
  노치까지 쓰려면 `layoutInDisplayCutoutMode = LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`도 설정합니다.
- **페이지의 전체 화면 버튼을 살리려면**: `WebChromeClient.onShowCustomView / onHideCustomView`를 구현합니다. 앱이 처음부터 전체 화면으로 띄우면 필요 없습니다.
- **WebView 설정**: `javaScriptEnabled = true`, `domStorageEnabled = true`(코인·설정 저장), `mediaPlaybackRequiresUserGesture = false`(효과음), 하드웨어 가속 사용.

### 회사 앱 iOS WKWebView (앱 개발 측 설정)

- **전체 화면 뷰**:
  - WebView를 화면 전체에 붙이고 `scrollView.contentInsetAdjustmentBehavior = .never`, `scrollView.isScrollEnabled = false`로 설정합니다.
  - 노치·홈 바 여백은 페이지가 `env(safe-area-inset-*)`로 직접 처리합니다.
- **상태 바·홈 인디케이터**: `prefersStatusBarHidden = true`, `prefersHomeIndicatorAutoHidden = true`.
- **회전**: `supportedInterfaceOrientations = .all`로 둡니다. WKWebView는 회전해도 새로고침되지 않습니다.
- **설정**: `allowsInlineMediaPlayback = true`, `mediaTypesRequiringUserActionForPlayback = []`(효과음).

### 확인하지 못한 것

- Claude 앱 미리보기 안에서 전체 화면 요청이 허용되는지는 실제 기기에서 확인해야 합니다.
- 회사 앱 WebView 동작은 앱 설정에 달려 있어서, 위 설정을 넣은 빌드로 확인해야 합니다.
- 에뮬레이터(Chromium, Pixel 7)에서는 START를 누르면 전체 화면으로 바뀌는 것을 확인했습니다.
