# GLP-1 Companion App - Flutter Architecture Blueprint

> Last Updated: March 2024
> Purpose: Migration guide from Next.js to Flutter for production launch

---

## 📱 Overview

Cross-platform mobile app (iOS/Android) for GLP-1 medication management, meal planning, and telehealth.

---

## 🏗 Architecture

```
lib/
├── main.dart                    # App entry point
├── app/                         # App-wide configuration
│   ├── routes.dart              # Navigation routes
│   └── theme.dart               # Theme configuration
├── core/                        # Core utilities
│   ├── constants/               # App constants
│   ├── utils/                   # Helper functions
│   └── errors/                  # Error handling
├── data/                        # Data layer
│   ├── models/                  # Data models
│   ├── repositories/           # Data repositories
│   └── services/               # API services
├── domain/                      # Business logic
│   ├── entities/               # Domain entities
│   ├── repositories/           # Repository interfaces
│   └── usecases/               # Use cases
├── presentation/              # UI layer
│   ├── pages/                  # Screen widgets
│   ├── widgets/                # Reusable widgets
│   └── providers/              # State management
└── config/                      # Environment config
```

---

## 📦 Required Packages

```yaml
dependencies:
  flutter:
    sdk: flutter
  
  # State Management
  flutter_riverpod: ^2.4.0      # Or provider/flutter_bloc
  
  # Navigation
  go_router: ^13.0.0
  
  # Networking
  dio: ^5.3.0
  retrofit: ^4.0.0
  
  # Local Storage
  hive: ^2.2.3
  shared_preferences: ^2.2.0
  
  # Video Calls (Telehealth)
  daily_sdk: ^0.9.0            # Daily.co integration
  
  # UI Components
  flutter_svg: ^2.0.0
  cached_network_image: ^3.3.0
  shimmer: ^3.0.0
  
  # Charts
  fl_chart: ^0.65.0
  
  # Forms & Validation
  flutter_form_builder: ^9.1.0
  form_builder_validators: ^9.1.0
  
  # Date/Time
  intl: ^0.18.0
  
  # Push Notifications
  firebase_messaging: ^14.6.0
  flutter_local_notifications: ^16.3.0
  
  # Image Picker
  image_picker: ^1.0.0
  
  # Charts for blood sugar tracking
  syncfusion_flutter_charts: ^24.1.0
```

---

## 🔌 API Integration

### Base API Client

```dart
// lib/data/services/api_client.dart
class ApiClient {
  final Dio _dio;
  
  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: 'https://api.glp-companion.com/v1',
      headers: {'Content-Type': 'application/json'},
    ));
    
    _dio.interceptors.add(AuthInterceptor());
    _dio.interceptors.add(LogInterceptor());
  }
  
  // Patient Profile APIs
  Future<Response> getPatientProfile(String userId);
  Future<Response> savePatientProfile(PatientProfile profile);
  
  // Meal APIs
  Future<Response> generateMealPlan(PatientProfile profile);
  Future<Response> getSavedMealPlans(String userId);
  
  // Food Log APIs
  Future<Response> logMeal(FoodLogEntry entry);
  Future<Response> getFoodLog(String userId, String date);
  
  // Telehealth APIs
  Future<Response> bookAppointment(Appointment appointment);
  Future<Response> getAppointments(String userId);
  Future<Response> createVideoRoom(String appointmentId);
}
```

### API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/patient/profile` | GET/POST | Patient profile |
| `/meals/generate` | POST | AI meal generation |
| `/food-log` | GET/POST/PUT/DELETE | Food logging |
| `/telehealth/appointments` | GET/POST | Appointment booking |
| `/telehealth/room` | POST | Video room creation |
| `/telehealth/availability` | GET/SET | Provider availability |

---

## 🎥 Telehealth Video Integration

### Daily.co Integration

```dart
// lib/data/services/video_service.dart
import 'package:daily_sdk/daily_sdk.dart';

class VideoService {
  late Daily _daily;
  
  Future<void> initialize() async {
    _daily = Daily();
    await _daily.create();
  }
  
  Future<String> createRoom(String appointmentId) async {
    final room = await _daily.createRoom(
      name: 'consult-$appointmentId',
      privacy: Privacy.private,
      properties: RoomProperties(
        exp: DateTime.now().add(Duration(hours: 1)),
        enable_screenshare: true,
        enable_chat: true,
        enable_knocking: true,
      ),
    );
    return room.url;
  }
  
  Future<void> joinRoom(String url, {bool audio = true, bool video = true}) async {
    await _daily.join(
      url: url,
      options: CallOptions(
        startVideo: video,
        startAudio: audio,
      ),
    );
  }
  
  Future<void> leaveRoom() async {
    await _daily.leave();
  }
}
```

### Flow

1. Patient books appointment → API creates room
2. Both patient & provider get room URL
3. At appointment time → join room via Daily.co SDK
4. After call → room auto-expires or manually closed

---

## 📊 Data Models

### Patient Profile

```dart
class PatientProfile {
  final String id;
  final String primaryGoal;      // weight_loss, maintain, muscle_gain, glp1_optimize
  final int targetWeight;
  final String timeline;         // 1_month, 3_months, 6_months, 1_year
  final int currentWeight;
  final int height;              // inches
  final int age;
  final String gender;           // male, female, other
  final String activityLevel;   // sedentary, light, moderate, active, very_active
  final String dietType;        // balanced, keto, low_carb, mediterranean, paleo
  final List<String> allergies;
  final List<String> restrictions;
  final List<String> favoriteFoods;
  final List<String> foodsToAvoid;
  final List<String> conditions;
  final List<String> medications;
  final bool hasGlp1Experience;
}
```

### Meal Plan

```dart
class Meal {
  final String id;
  final String name;
  final String mealType;         // breakfast, lunch, dinner, snack
  final int calories;
  final int protein;
  final int carbs;
  final int fat;
  final int fiber;
  final int netCarbs;
  final List<String> ingredients;
  final String prepTime;
  final String instructions;
}

class MealPlan {
  final List<Meal> meals;
  final NutritionSummary dailyTargets;
}

class NutritionSummary {
  final int dailyCalories;
  final int protein;
  final int carbs;
  final int fat;
  final int fiber;
}
```

### Food Log Entry

```dart
class FoodLogEntry {
  final String id;
  final String userId;
  final Meal meal;
  final DateTime date;
  final DateTime time;
  final int? bloodSugar;         // mg/dL (optional)
  final String? notes;
}
```

### Telehealth Appointment

```dart
class Appointment {
  final String id;
  final String patientId;
  final String providerId;
  final DateTime dateTime;
  final String reason;
  final AppointmentType type;    // initial, followup, urgent
  final AppointmentStatus status; // scheduled, in_progress, completed
  final String? videoRoomUrl;
}
```

---

## 🧭 Navigation (GoRouter)

```dart
// lib/app/routes.dart
final router = GoRouter(
  initialLocation: '/',
  routes: [
    // Auth
    GoRoute(path: '/login', builder: (_, __) => LoginPage()),
    GoRoute(path: '/register', builder: (_, __) => RegisterPage()),
    
    // Main App
    ShellRoute(
      builder: (_, __, child) => MainShell(child: child),
      routes: [
        GoRoute(path: '/', builder: (_, __) => DashboardPage()),
        GoRoute(path: '/food-log', builder: (_, __) => FoodLogPage()),
        GoRoute(path: '/ai-meals', builder: (_, __) => AIMealsPage()),
        GoRoute(path: '/telehealth', builder: (_, __) => TelehealthPage()),
        GoRoute(path: '/profile', builder: (_, __) => ProfilePage()),
        
        // Intake Flow
        GoRoute(path: '/intake', builder: (_, __) => PatientIntakePage()),
        
        // Provider Portal
        GoRoute(path: '/provider', builder: (_, __) => ProviderDashboardPage()),
      ],
    ),
    
    // Video Call (Outside shell)
    GoRoute(path: '/video/:appointmentId', builder: (_, state) {
      final appointmentId = state.pathParameters['appointmentId']!;
      return VideoCallPage(appointmentId: appointmentId);
    }),
  ],
);
```

---

## 💾 State Management

### Riverpod Example

```dart
// lib/presentation/providers/patient_provider.dart
final patientProvider = StateNotifierProvider<PatientNotifier, AsyncValue<PatientProfile?>>((ref) {
  return PatientNotifier(ref.read(apiClient));
});

class PatientNotifier extends StateNotifier<AsyncValue<PatientProfile?>> {
  final ApiClient _apiClient;
  
  PatientNotifier(this._apiClient) : super(const AsyncValue.loading());
  
  Future<void> loadProfile(String userId) async {
    state = const AsyncValue.loading();
    try {
      final response = await _apiClient.getPatientProfile(userId);
      state = AsyncValue.data(PatientProfile.fromJson(response.data));
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
  
  Future<void> saveProfile(PatientProfile profile) async {
    await _apiClient.savePatientProfile(profile);
    state = AsyncValue.data(profile);
  }
}
```

---

## 🔐 Authentication Flow

1. **Login** → POST /auth/login → Get JWT token
2. **Store token** → SharedPreferences (encrypted)
3. **API calls** → Include token in Authorization header
4. **Token expiry** → Refresh token or redirect to login
5. **Logout** → Clear token, navigate to login

---

## 📲 Push Notifications

### Firebase Cloud Messaging

1. Setup Firebase project
2. Add google-services.json (Android) / GoogleService-Info.plist (iOS)
3. Configure notification channels
4. Handle background/foreground notifications
5. Navigate to relevant screen on tap

### Notification Types

- Appointment reminders (15 min before)
- Meal log reminders (mealtime)
- New message from provider
- Prescription refill reminders

---

## 🧪 Testing Strategy

- **Unit tests** → Business logic, utils
- **Widget tests** → Individual UI components
- **Integration tests** → Full user flows
- **E2E tests** → Critical paths (login → book appointment → video call)

---

## 🚀 Deployment

### Android
- Debug APK for testing
- Release APK for Play Store
- ProGuard/R8 optimization

### iOS
- Xcode build for simulator
- Archive for App Store
- TestFlight for beta testing

---

## 📝 Migration Checklist

- [ ] Set up Flutter project with proper structure
- [ ] Install all dependencies
- [ ] Configure Firebase (analytics, messaging)
- [ ] Implement API client with authentication
- [ ] Build all pages (copy from Next.js)
- [ ] Integrate Daily.co for video calls
- [ ] Add local caching with Hive
- [ ] Push notification setup
- [ ] Testing & bug fixes
- [ ] App icon & splash screen
- [ ] Build & submit to stores