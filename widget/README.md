# Sports Widget Component

Bu dokümantasyon, SportRadar widget'larını Next.js uygulamasında server action ile kullanmak için oluşturulan component'i açıklar.

## 📁 Dosya Yapısı

```
apps/web/src/
├── actions/
│   └── widget-actions.ts          # Server actions
├── components/
│   └── common/
│       └── sports-widget.tsx      # Widget component
└── app/[locale]/(ui)/
    └── widget-demo/
        └── page.tsx               # Demo sayfası
```

## 🎯 Ana Özellikler

### 1. Server Action Powered
- **`getWidgetDataAction`**: Widget konfigürasyonunu server-side'da hazırlar
- **`validateMatchAction`**: Match ID doğrulaması yapar
- Enterprise-level error handling ve logging

### 2. Dinamik Widget Yönetimi
- **Live ve Prematch** widget desteği
- **Çoklu spor** desteği (Football, Basketball, Tennis, vb.)
- **Tema ve dil** konfigürasyonu
- **Özelleştirilebilir attributes**

### 3. Boyut Takibi (`statisticsInterval`)
- **300ms aralıklarla** widget boyutunu kontrol eder
- **Dinamik yükseklik** ayarlaması yapar
- **Parent window iletişimi** (iframe kullanımı için)
- **Callback fonksiyonu** ile boyut değişikliklerini bildirir

## 🚀 Kullanım

### Temel Kullanım

```tsx
import SportsWidget from '@/components/common/sports-widget'

export default function MyPage() {
  return (
    <SportsWidget
      matchId="sr:match:42506052"
      matchType="live"
      sportId={1}
      language="en"
      theme="bet2y:light"
    />
  )
}
```

### Gelişmiş Kullanım

```tsx
import SportsWidget from '@/components/common/sports-widget'

export default function MyPage() {
  const handleWidgetResize = (dimensions: { width: number; height: number }) => {
    console.log('Widget boyutu değişti:', dimensions)
  }

  return (
    <SportsWidget
      matchId="sr:match:42506052"
      matchType="live"
      sportId={1}
      language="tr"
      theme="bet2y:dark"
      attributes={{
        hidePitchLogo: false,
        hideGoalImage: false,
        disablePitchNoise: true,
        isCollapsed: false
      }}
      onResize={handleWidgetResize}
      className="my-custom-class"
    />
  )
}
```

## 📋 Props

| Prop | Tip | Varsayılan | Açıklama |
|------|-----|------------|----------|
| `matchId` | `string` | **Gerekli** | SportRadar match ID'si |
| `language` | `string` | `"en"` | Widget dili (en, tr, de, es) |
| `theme` | `string` | `"bet2y:light"` | Widget teması |
| `matchType` | `"live" \| "prematch"` | `"live"` | Maç tipi |
| `sportId` | `number` | - | Spor ID'si (1=Football, 2=Basketball, vb.) |
| `attributes` | `Record<string, any>` | - | Özel widget ayarları |
| `className` | `string` | `""` | CSS class'ı |
| `onResize` | `function` | - | Boyut değişikliği callback'i |

## 🏈 Desteklenen Sporlar

| Spor | ID | Açıklama |
|------|----|---------| 
| Football | 1 | Futbol |
| Basketball | 2 | Basketbol |
| Baseball | 3 | Beyzbol |
| Ice Hockey | 4 | Buz Hokeyi |
| Tennis | 5 | Tenis |
| Boxing | 10 | Boks |
| Table Tennis | 20 | Masa Tenisi |
| Volleyball | 23 | Voleybol |
| Badminton | 31 | Badminton |

## ⚙️ Widget Attributes

### Temel Ayarlar
```tsx
{
  hidePitchLogo: boolean,        // Saha logosunu gizle
  hideGoalImage: boolean,        // Gol görselini gizle
  disablePitchNoise: boolean,    // Saha gürültüsünü kapat
  isCollapsed: boolean,          // Başlangıçta kapalı (prematch için)
}
```

### Gelişmiş Ayarlar
```tsx
{
  layout: 'single',              // Widget layout'u
  activeSwitcher: 'scoreDetails', // Aktif sekme
  tabsPosition: 'top',           // Tab pozisyonu
  scoreboard: 'disable',         // Skor tablosu
  collapseTo: 'disable',         // Kapanma davranışı
}
```

## 🎮 Demo Sayfası

Demo sayfasına erişim: `http://localhost:3000/widget-demo`

### Demo Özellikleri:
- **Interaktif konfigürasyon** paneli
- **Örnek match ID'leri** ile hızlı test
- **Canlı boyut takibi** gösterimi
- **Gelişmiş ayarlar** sekmesi
- **Reset ve reload** fonksiyonları

## 🔧 statisticsInterval Detayları

`statisticsInterval` widget'ın dinamik boyut yönetimi için kritik bir özelliktir:

### Ne Yapar?
1. **300ms aralıklarla** widget container'ını kontrol eder
2. Widget yüksekliği **100px'den fazlaysa** minimum yüksekliği ayarlar
3. **Parent window'a** boyut bilgilerini gönderir (iframe için)
4. **onResize callback'ini** tetikler

### Neden Önemli?
- Widget içeriği dinamik olarak değişir (live skorlar, istatistikler)
- Parent container'ın boyutunun otomatik ayarlanması gerekir
- iframe içinde kullanıldığında parent sayfa boyutu bilmeli

### Kod Örneği:
```javascript
// Her 300ms'de çalışır
setInterval(() => {
  const widget = document.getElementById('widget-container')
  if (widget?.offsetHeight > 100) {
    // Container yüksekliğini ayarla
    container.style.minHeight = `${widget.offsetHeight}px`
    
    // Parent window'a bildir
    window.parent.postMessage({
      type: 'widget-resize',
      width: widget.offsetWidth,
      height: widget.offsetHeight,
      matchId: matchId
    }, '*')
  }
}, 300)
```

## 🛠️ Server Actions

### getWidgetDataAction
Widget konfigürasyonunu hazırlar ve döndürür.

```typescript
const result = await getWidgetDataAction('sr:match:42506052', {
  language: 'tr',
  theme: 'bet2y:dark',
  matchType: 'live',
  sportId: 1
})
```

### validateMatchAction
Match ID'sinin geçerliliğini kontrol eder.

```typescript
const result = await validateMatchAction('sr:match:42506052')
```

## 🎨 Styling

Widget varsayılan olarak responsive tasarıma sahiptir:

```css
.widgets {
  width: 100%;
  max-width: 100vw;
  position: relative;
  right: 0;
  overflow: hidden;
}
```

Custom styling için `className` prop'unu kullanabilirsiniz.

## 🔍 Debugging

Development modunda console'da şu logları görebilirsiniz:

```
🔒 Server Action: getWidgetData for match sr:match:42506052
🎯 SportRadar script loaded
🎯 Initializing live widget
✅ Server Action: Widget data prepared successfully
```

## 📝 Notlar

1. **SportRadar API Key**: Widget loader script'inde gömülü olarak gelir
2. **CORS**: SportRadar widget'ları cross-origin istekleri destekler
3. **Performance**: Widget lazy loading destekler
4. **Mobile**: Responsive tasarım ile mobil uyumlu
5. **Error Handling**: Comprehensive error states ve fallback'ler

## 🚨 Önemli Uyarılar

- Match ID'leri **SportRadar formatında** olmalı (`sr:match:XXXXXX`)
- Widget **internet bağlantısı** gerektirir
- **SportRadar servis durumu** widget'ı etkileyebilir
- **Browser compatibility** modern tarayıcılar gerektirir
