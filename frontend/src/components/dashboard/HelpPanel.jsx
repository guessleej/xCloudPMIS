/**
 * HelpPanel.jsx
 * 全站說明面板 — 每頁每功能完整使用說明
 * 資深系統架構師撰寫
 */
import { useState, useMemo } from 'react';
import { useIsMobile } from '../../hooks/useResponsive';

// ── 頁面對應說明索引 ──────────────────────────────────────
const PAGE_MAP = {
  home:            'home',
  'my-tasks':      'my-tasks',
  inbox:           'inbox',
  analytics:       'analytics',
  reports:         'reports',
  portfolios:      'portfolios',
  goals:           'goals',
  workload:        'workload',
  projects:        'projects',
  tasks:           'tasks',
  gantt:           'gantt',
  rules:           'automation',
  forms:           'forms',
  'custom-fields': 'custom-fields',
  time:            'timelog',
  settings:        'settings',
  'user-management': 'permissions',
};

// ── 說明資料庫 ─────────────────────────────────────────────
const HELP_DATA = [
  // ══════════════════════════════════════════════════════
  {
    id: 'home',
    icon: '🏠',
    title: '首頁',
    subtitle: '個人工作台總覽',
    description: '首頁是你每日開始工作的起點，彙整了個人任務、專案狀態、逾期警示與快捷入口，讓你一眼掌握今日工作重點。',
    sections: [
      {
        title: '今日重點側欄',
        icon: '📌',
        items: [
          { label: '下一個截止', desc: '顯示離你最近截止的任務名稱與日期，提醒優先處理。' },
          { label: '逾期關注', desc: '統計目前逾期未完成的任務數量，數字越大代表越需要立即跟進。' },
          { label: '同步狀態', desc: '顯示首頁資料的最後更新時間，確認資料是否即時。' },
        ],
      },
      {
        title: 'KPI 統計卡片',
        icon: '📊',
        items: [
          { label: '本週截止', desc: '七天內到期的任務總數。點擊可跳轉至「我的任務」並套用本週截止篩選。' },
          { label: '已完成', desc: '最近七天內你標記完成的任務數量。' },
          { label: '活躍專案', desc: '目前在首頁顯示的重點專案數量。透過「版面設定」可調整。' },
          { label: '協作成員', desc: '近期在工作負載中與你協作的成員人數。' },
        ],
      },
      {
        title: '我的任務區',
        icon: '✅',
        items: [
          { label: '即將截止', desc: '按截止日排序，顯示七天內到期的任務清單，每筆顯示專案名稱與截止日。' },
          { label: '逾期', desc: '所有已超過截止日且尚未完成的任務，建議每日首先處理。' },
          { label: '已完成', desc: '近七天已完成的任務紀錄，方便回顧今週工作成果。' },
          { label: '點擊任務', desc: '點擊任何一筆任務列可跳轉至對應的任務看板並展開詳情。' },
        ],
      },
      {
        title: '重點專案區',
        icon: '🗂️',
        items: [
          { label: '專案卡片', desc: '顯示進度條、已完成任務數與逾期任務數。進度條顏色：綠色≥75%、橙色40~74%、紅色<40%。' },
          { label: '更新資料', desc: '點擊「更新資料」按鈕可強制重新整理專案統計，通常在伺服器有異動後使用。' },
          { label: '查看全部', desc: '跳轉至「所有專案」頁面查看完整清單。' },
        ],
      },
      {
        title: '版面設定',
        icon: '⚙️',
        items: [
          { label: '開關小工具', desc: '點擊右上角「版面設定」，可勾選/取消勾選要在首頁顯示的三個區塊：我的任務面板、專案概覽面板、月度趨勢與洞察。' },
          { label: '套用設定', desc: '調整後點擊「套用設定」按鈕，頁面會立即重新排列。' },
        ],
      },
    ],
    tips: [
      '每天早上打開首頁，先看「逾期關注」數字，再處理「即將截止」清單，是最有效的日常習慣。',
      '如果首頁資料看起來不是最新的，點擊頁面上方的「重新整理資料」按鈕即可同步。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'my-tasks',
    icon: '✅',
    title: '我的任務',
    subtitle: '個人任務工作台',
    description: '我的任務是個人任務的核心管理中心，以分組列表呈現所有指派給你的工作，支援拖曳排序與優先度篩選。',
    sections: [
      {
        title: '任務列表視圖',
        icon: '👁️',
        items: [
          { label: '分組顯示', desc: '任務依狀態自動分為「待處理、進行中、審核中、已完成」四個群組，每組可獨立折疊。' },
          { label: '拖曳排序', desc: '在同一群組內拖曳任務卡片可調整排序，方便標示個人優先處理順序。' },
          { label: '篩選列', desc: '頂部提供狀態（全部/進行中/已完成）與優先度下拉篩選，快速聚焦需要的任務。' },
        ],
      },
      {
        title: '新增任務',
        icon: '➕',
        items: [
          { label: '快速新增', desc: '點擊任務列表右上角「+ 新增任務」按鈕，或使用頁面頂部的新增入口，快速輸入任務標題。' },
          { label: '完整表單', desc: '點擊「+ 新增任務」主按鈕開啟完整表單，可設定標題、描述、截止日、優先度、指派人、所屬專案。' },
          { label: '欄位說明', desc: '優先度：緊急（紅）/ 高（橙）/ 中（藍）/ 低（綠）。截止日設定後會自動在看板卡片上顯示。' },
        ],
      },
      {
        title: '任務操作',
        icon: '🔧',
        items: [
          { label: '推進狀態', desc: '每張卡片右側有「開始 → 送審 → 完成」推進按鈕，點擊即可快速移動到下一個狀態。' },
          { label: '開啟詳情', desc: '點擊卡片標題或「⋯」按鈕開啟側面板，可查看/編輯完整任務資訊、新增子任務、上傳附件。' },
          { label: '刪除任務', desc: '在詳情面板右上角點擊刪除圖示，確認後執行軟刪除（可在資料庫層面復原）。' },
          { label: '子任務', desc: '在任務詳情中點擊「新增子任務」，可建立階層式任務結構，子任務完成進度會計入父任務。' },
        ],
      },
      {
        title: '篩選與搜尋',
        icon: '🔍',
        items: [
          { label: '狀態篩選', desc: '點擊頁面上方「待辦 / 進行中 / 審核中 / 已完成」標籤可切換顯示的任務群組。' },
          { label: '專案篩選', desc: '從「所有專案」下拉選單選擇特定專案，只顯示該專案的任務。' },
          { label: '排序', desc: '列表視圖可點擊欄位標題排序；看板視圖依截止日由近至遠排列。' },
        ],
      },
      {
        title: '自動化整合',
        icon: '⚡',
        items: [
          { label: '自動指派', desc: '當自動化規則觸發（如：新任務建立）且規則設定指派給你時，任務會自動出現在此頁。' },
          { label: '狀態同步', desc: '在專案詳情中推進的任務，狀態變更會即時同步至我的任務視圖。' },
        ],
      },
    ],
    tips: [
      '使用「緊急」優先度標記今日必須完成的任務，配合看板視圖能一眼看出每日工作重心。',
      '每週五花 10 分鐘回顧「已完成」頁，有助於確認成果並為下週規劃做準備。',
      '子任務適合用於複雜度高的工作，拆解後每個步驟都能獨立追蹤，避免大任務停滯。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'inbox',
    icon: '📬',
    title: '收件匣',
    subtitle: '通知與協作更新中心',
    description: '收件匣彙整所有與你相關的系統通知、任務指派、狀態變更與協作訊息，確保你不錯過任何重要更新。',
    sections: [
      {
        title: '通知類型',
        icon: '🔔',
        items: [
          { label: '任務指派', desc: '當有人將任務指派給你時，系統自動發送通知，包含任務名稱、所屬專案與截止日。' },
          { label: '狀態變更', desc: '你負責的任務被他人推進或退回時，收件匣會記錄狀態前後變化。' },
          { label: '留言提及', desc: '在任務留言中使用 @你的名稱 時，系統會發送通知並標記為高優先。' },
          { label: '截止警示', desc: '系統自動於截止日前 24 小時發送提醒通知。' },
          { label: '自動化觸發', desc: '由自動化規則觸發的動作（如：自動指派、狀態變更）也會記錄在此。' },
        ],
      },
      {
        title: '操作通知',
        icon: '✉️',
        items: [
          { label: '標記已讀', desc: '點擊通知項目可展開詳情並自動標記為已讀；頂部計數器數字會同步更新。' },
          { label: '全部已讀', desc: '點擊「全部標為已讀」一鍵清除所有未讀標記，適合積累大量通知時使用。' },
          { label: '跳轉來源', desc: '點擊通知中的任務或專案連結，可直接跳轉至對應頁面。' },
        ],
      },
      {
        title: '篩選與管理',
        icon: '🗂️',
        items: [
          { label: '類型標籤篩選', desc: '頂部提供七種類型標籤快速篩選：全部、指派（📋）、提及（📣）、留言（💬）、截止（⏰）、完成（✅）、摘要（📊）。' },
          { label: '類型說明', desc: '「指派」= 有人將任務指派給你；「提及」= @提及你；「留言」= 任務有新留言；「截止」= 截止日快到的提醒；「摘要」= 系統定期發送的活動摘要。' },
          { label: '全部已讀', desc: '點擊「全部標為已讀」一鍵清除所有未讀標記，適合積累大量通知時使用。' },
          { label: '清除全部', desc: '點擊「清除全部」刪除所有通知記錄，操作後無法復原。' },
        ],
      },
    ],
    tips: [
      '建議每天上午打開收件匣確認是否有新指派或緊急通知，養成清匣習慣能確保協作順暢。',
      '頂部導覽列的鈴鐺圖示會顯示紅色徽章代表未讀數量，不需要每次都進入頁面才能確認。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'analytics',
    icon: '📊',
    title: '分析總覽',
    subtitle: 'KPI 圖表與健康狀態監控',
    description: '分析總覽提供整體專案與任務的即時 KPI 指標、健康狀態分布、成員工作負載與月度趨勢圖，協助管理層快速掌握專案群組的整體表現。',
    sections: [
      {
        title: 'KPI 統計卡片',
        icon: '📈',
        items: [
          { label: '整體完成率', desc: '所有活躍專案的任務完成百分比。計算公式：已完成任務 ÷ 總任務數 × 100%。' },
          { label: '進行中專案', desc: '目前狀態為「進行中」的專案總數，點擊可展開專案清單。' },
          { label: '逾期任務', desc: '所有專案中超過截止日且尚未完成的任務總數，數字越大代表風險越高。' },
          { label: '團隊成員', desc: '在系統中被指派了至少一個任務的成員人數。' },
        ],
      },
      {
        title: '專案健康狀態分布',
        icon: '🍩',
        items: [
          { label: '圓餅圖', desc: '以 50/50 或實際比例顯示「健康 / 待關注 / 高風險」三種狀態的專案分布。' },
          { label: '健康', desc: '進度正常、無逾期任務的專案。' },
          { label: '待關注', desc: '進度輕微落後或有少量逾期任務，需要留意但尚未危急。' },
          { label: '高風險', desc: '嚴重落後或逾期任務過多，需立即介入處理。點擊可看到具體專案。' },
        ],
      },
      {
        title: '專案任務進度',
        icon: '📊',
        items: [
          { label: '橫條圖', desc: '每個專案以橫條顯示各狀態（待辦、進行中、審核中、已完成）的任務數量，一眼看出瓶頸在哪個階段。' },
          { label: '顏色說明', desc: '灰=待辦、藍=進行中、橙=審核中、綠=已完成。審核中比例高代表審核流程可能是瓶頸。' },
        ],
      },
      {
        title: '成員工作負載',
        icon: '👥',
        items: [
          { label: '長條圖', desc: '顯示每位成員目前持有的各狀態任務數，用於評估是否有成員過載或閒置。' },
          { label: '負載評估', desc: '進行中任務超過 5 個且有多個逾期任務的成員，可能需要重新分配工作。' },
        ],
      },
      {
        title: '月度趨勢與洞察',
        icon: '📉',
        items: [
          { label: '折線圖', desc: '顯示最近 6 個月的任務新建數量與完成數量趨勢。兩線持平或完成線高於新建線代表消化良好。' },
          { label: '逾期任務清單', desc: '頁面下方列出目前逾期的任務，包含負責人、所屬專案與逾期天數，方便直接追蹤。' },
        ],
      },
      {
        title: '自訂小工具',
        icon: '⚙️',
        items: [
          { label: '自訂版面', desc: '點擊右上角「自訂小工具」，可開關各個分析圖表區塊，只顯示你關心的指標。' },
          { label: '重新整理', desc: '點擊「重新整理」強制重新拉取最新分析資料，適合在有大量任務異動後使用。' },
        ],
      },
    ],
    tips: [
      '每週一早上看分析總覽，是掌握上週工作成果與本週重點的最佳時機。',
      '若「逾期任務」數字持續升高，需檢查是否任務量超出團隊容量，或截止日設定不合理。',
      '月度趨勢中新建任務遠大於完成任務，代表團隊正在「積壓」，需評估是否擴充人力或調整排程。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'reports',
    icon: '📋',
    title: '報告',
    subtitle: '管理層報告與資料匯出',
    description: '報告頁提供多種格式的管理層報告，包含高層摘要、任務分析、成員績效、專案健康度，並支援 CSV 匯出，方便呈現給利害關係人。',
    sections: [
      {
        title: '報告類型',
        icon: '📄',
        items: [
          { label: '高層摘要 (Executive)', desc: '一頁式總覽報告，包含整體完成率、風險指標、本月里程碑與行動建議，適合呈現給高階主管。' },
          { label: '任務分析', desc: '詳細的任務狀態分布、優先度分析、逾期趨勢，適合專案經理做深度診斷。' },
          { label: '成員績效', desc: '各成員的任務完成率、逾期率、平均處理天數，用於績效評核或工作調配。' },
          { label: '專案健康度', desc: '各專案的進度、預算使用、風險等級的對比矩陣，適合每週專案回顧使用。' },
        ],
      },
      {
        title: '產生報告',
        icon: '▶️',
        items: [
          { label: '選擇類型', desc: '點擊頁面頂部的報告類型按鈕（高層摘要、任務分析等）選擇所需報告。' },
          { label: '設定時間區間', desc: '選擇報告涵蓋的起始與結束日期，系統預設為本月。' },
          { label: '產生報告', desc: '點擊「產生報告」按鈕，系統會計算並渲染報告內容（通常需要 1~3 秒）。' },
        ],
      },
      {
        title: '匯出 CSV',
        icon: '📥',
        items: [
          { label: '匯出按鈕', desc: '報告產生後右上角出現「匯出 CSV」按鈕，點擊後瀏覽器自動下載 .csv 格式檔案。' },
          { label: '檔案說明', desc: 'CSV 檔案可直接用 Excel 或 Google Sheets 開啟，包含完整原始資料，方便進一步分析。' },
          { label: '注意事項', desc: '高層摘要報告目前不支援 CSV 匯出（因為是組合型彙整報告），其他類型均可匯出。' },
        ],
      },
      {
        title: '儲存與管理',
        icon: '💾',
        items: [
          { label: '儲存報告', desc: '點擊「儲存此報告」可將報告快照儲存至系統，方便日後查閱或與他人共享連結。' },
          { label: '已儲存報告', desc: '頁面右側「已儲存的報告」清單列出所有歷史快照，點擊可重新載入。' },
          { label: '刪除報告', desc: '滑鼠移至已儲存報告項目右側，出現刪除按鈕後點擊確認刪除。' },
        ],
      },
    ],
    tips: [
      '「高層摘要」報告最適合每月月初寄給管理層，只需一頁就能呈現整體專案狀況。',
      '匯出 CSV 後在 Excel 中使用樞紐分析表，可以做出更多客製化的分析圖表。',
      '設定固定的報告儲存習慣（如每月最後一個工作日），方便日後做月度比較。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'portfolios',
    icon: '🗃️',
    title: '專案集',
    subtitle: '多專案組合管理',
    description: '專案集讓你將相關專案組合在一起統一管理，從更高層次監控多個專案的整體進度、風險與資源分配。',
    sections: [
      {
        title: '建立專案集',
        icon: '➕',
        items: [
          { label: '新增專案集', desc: '點擊右上角「＋ 新增專案集」，輸入名稱、描述與負責人後建立。' },
          { label: '加入專案', desc: '在專案集詳情中點擊「加入專案」，從現有專案清單中勾選要納入的專案。' },
        ],
      },
      {
        title: '監控視角',
        icon: '📊',
        items: [
          { label: '整體進度', desc: '顯示所有納入專案的平均完成率，以及各專案的個別進度條。' },
          { label: '健康狀態', desc: '以紅/黃/綠三色標示各專案的健康等級，紅色需立即關注。' },
          { label: '時程總覽', desc: '顯示各專案的開始與截止日區間，方便識別時間衝突。' },
        ],
      },
    ],
    tips: [
      '適合用於管理同一個產品線的多個子專案，例如「2026 年 Q2 發布計畫」包含 UI、後端、測試等專案。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'goals',
    icon: '🎯',
    title: '目標',
    subtitle: 'OKR 目標追蹤',
    description: '目標頁採用 OKR（Objectives and Key Results）框架，讓你設定年度/季度目標，並將專案輸出與目標成果連結，確保日常工作對齊策略方向。',
    sections: [
      {
        title: '視圖切換',
        icon: '👁️',
        items: [
          { label: '列表視圖', desc: '預設視圖，以展開/收合的樹狀清單顯示所有目標與其下的關鍵結果。' },
          { label: '策略地圖', desc: '點擊「🗺️ 策略地圖」切換至視覺化樹狀圖，以 Bezier 曲線連結上下層目標，清楚呈現目標階層關係。' },
        ],
      },
      {
        title: '目標架構',
        icon: '🏗️',
        items: [
          { label: 'Objective（目標）', desc: '描述你希望達成的大方向，通常是定性的宏觀陳述，例如「提升用戶體驗滿意度」。' },
          { label: 'Key Result（關鍵結果）', desc: '可量化的具體成果指標，帶有當前值／目標值（如 currentValue / targetValue），每個目標建議 2~5 個關鍵結果。' },
          { label: '上層目標', desc: '新增目標時可指定「上層目標（策略地圖階層）」，建立多層目標樹，並在策略地圖中以連線顯示。' },
        ],
      },
      {
        title: '新增目標',
        icon: '➕',
        items: [
          { label: '建立目標', desc: '點擊「＋ 新增目標」，填入目標名稱、負責人、時間週期（季度/年度）、描述，以及可選的上層目標。' },
          { label: '新增 KR', desc: '在目標詳情中點擊「＋ 新增關鍵結果」，設定 KR 名稱與目標值。' },
        ],
      },
      {
        title: '進度更新',
        icon: '📊',
        items: [
          { label: '手動更新', desc: '點擊 KR 旁的「＋」或「－」按鈕，以遞增或遞減方式調整當前值（currentValue），系統自動換算完成百分比。' },
          { label: '整體進度', desc: '所有 KR 的平均完成度決定 Objective 的整體進度百分比。' },
          { label: '狀態顏色', desc: '綠色 ≥ 80%、黃色 50–79%、紅色 < 50%，依當前完成比例自動顯示。' },
        ],
      },
    ],
    tips: [
      '善用「上層目標」欄位建立層級結構，再切換至策略地圖，可直觀確認各目標的上下對齊關係。',
      '每季初花 30 分鐘設定 OKR，每週花 5 分鐘確認進度，是有效執行 OKR 的最佳節奏。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'workload',
    icon: '⚖️',
    title: '工作負載',
    subtitle: '團隊容量與任務分配管理',
    description: '工作負載頁面讓管理者即時了解每位成員的任務量與時間分配，識別過載或閒置成員，做出更合理的人力調配決策。',
    sections: [
      {
        title: '視圖模式',
        icon: '📊',
        items: [
          { label: '矩陣視圖（matrix）', desc: '預設視圖，橫軸為日期、縱軸為成員，每個格子顯示該成員在該日期的負載等級。點擊非零格子可開啟任務詳情側欄。' },
          { label: '卡片視圖（cards）', desc: '以卡片形式顯示每位成員的整體負載摘要，適合快速掌握全隊狀態。' },
          { label: '時間軸視圖（timeline）', desc: '以時間軸方式呈現每位成員的任務分布，固定顯示往後 4 週區間。' },
        ],
      },
      {
        title: '負載計算方式',
        icon: '⚙️',
        items: [
          { label: '自動計算', desc: '容量由系統根據成員實際持有的任務數量自動計算，無需手動設定工時。' },
          { label: '五級指示燈', desc: '系統依負載程度分為五個等級：free（空閒）/ light（輕鬆）/ moderate（適中）/ heavy（繁忙）/ overloaded（過載），每級以對應顏色顯示。' },
        ],
      },
      {
        title: '任務重新分配',
        icon: '🔄',
        items: [
          { label: '查看成員任務', desc: '在矩陣視圖點擊有負載的格子，右側彈出 TaskDrawer，顯示該成員在該時段的所有任務。' },
          { label: '重新指派', desc: '在任務詳情中更改「負責人」欄位，即可將任務轉移給其他成員。' },
        ],
      },
    ],
    tips: [
      '矩陣視圖可最快速識別哪位成員在哪幾天出現 heavy / overloaded 狀態，是進行人力調配的最佳起點。',
      '過載的成員除了重新分配任務外，也需確認是否有任務可以延後或降低優先度。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'projects',
    icon: '📁',
    title: '所有專案',
    subtitle: '專案清單管理中心',
    description: '所有專案頁面提供組織內所有專案的全局視圖，支援列表、看板、日曆三種視角，讓你快速建立、檢視與管理專案。',
    sections: [
      {
        title: '建立新專案',
        icon: '➕',
        items: [
          { label: '開啟表單', desc: '點擊「＋ 新增專案」會直接開啟空白專案表單，不再經過範本選擇。' },
          { label: '專案設定', desc: '填入專案名稱、負責人、開始/截止日、成員、預算（選填）與描述。' },
          { label: '專案顏色', desc: '點擊顏色按鈕可展開 360° 調色盤，自由選擇專案識別色。' },
          { label: '建立完成', desc: '點擊「🚀 建立專案」後，系統自動建立專案並跳轉至專案詳情頁。' },
        ],
      },
      {
        title: 'KPI 統計區',
        icon: '📊',
        items: [
          { label: '全部專案', desc: '組織內總專案數量。' },
          { label: '進行中', desc: '狀態為「進行中」或「有風險」的活躍專案數。' },
          { label: '有風險', desc: '健康評估為「有風險」的專案數，通常代表逾期任務過多或進度嚴重落後。' },
          { label: '已完成', desc: '狀態為「已完成」的封存專案數。' },
        ],
      },
      {
        title: '篩選與排序',
        icon: '🔍',
        items: [
          { label: '狀態篩選', desc: '點擊「全部 / 進行中 / 規劃中 / 有風險 / 已完成」標籤快速過濾。' },
          { label: '視圖切換', desc: '右側三個圖示可切換列表（☰）、看板（⊞）、日曆（🗓）視圖。' },
          { label: '健康狀態欄', desc: '列表視圖中「狀態」欄顯示進行中/規劃中等，負責人欄顯示頭像，截止日欄標紅代表逾期。' },
        ],
      },
      {
        title: '專案操作',
        icon: '🔧',
        items: [
          { label: '開啟詳情', desc: '點擊專案名稱列可跳轉至專案詳情頁，查看所有任務、里程碑與統計。' },
          { label: '編輯專案', desc: '滑鼠移至專案列，右側出現「編輯」按鈕，可修改名稱、截止日、負責人等基本資訊。權限：admin 全部；PM 僅限自己建立的專案。' },
          { label: '專案成員管理', desc: '在專案詳情頁頂部標題列右側，顯示所有成員的頭像 pill。admin 與專案擁有者（PM）可點「＋ 加入成員」新增成員，或點擊 pill 上的 × 移除成員。' },
          { label: '刪除專案', desc: '點擊「刪除」按鈕後需確認。系統執行軟刪除，專案資料不會永久消失，管理員可從後台復原。權限：admin 全部；PM 僅限自己建立的專案。' },
        ],
      },
    ],
    tips: [
      '每個專案建立時選擇適合的顏色，在所有頁面中都能快速辨識。同一產品線建議使用相近色系。',
      '「看板視圖」適合小團隊（5 個以下專案），「列表視圖」適合有大量專案需要批量管理的場景。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'tasks',
    icon: '🗂️',
    title: '任務看板',
    subtitle: '跨專案任務總覽與管理',
    description: '任務看板提供組織內所有專案任務的全局看板視圖，讓你跨專案追蹤任務狀態、優先度與截止日，並提供自動化規則反饋與快速操作。',
    sections: [
      {
        title: '看板結構',
        icon: '🏗️',
        items: [
          { label: '待辦欄', desc: '所有尚未開始的任務，依優先度由高至低排序：緊急（紅色邊框）最先顯示。' },
          { label: '進行中欄', desc: '目前正在執行的任務。卡片顯示負責人頭像、截止日（逾期標紅）、子任務數量。' },
          { label: '審核中欄', desc: '已完成工作等待審核的任務，通常代表需要上司或客戶確認。' },
          { label: '已完成欄', desc: '已確認完成的任務，以灰色調顯示，可定期封存。' },
        ],
      },
      {
        title: '任務卡片',
        icon: '🎫',
        items: [
          { label: '優先度指示', desc: '卡片左側彩色邊條：紅=緊急、橙=高、藍=中、綠=低。讓你不看文字也能快速判斷重要性。' },
          { label: '截止日徽章', desc: '顯示格式：「3月23日」。逾期為紅色，3天內截止為橙色，其他為灰色。' },
          { label: '專案標籤', desc: '卡片下方顯示任務所屬專案名稱，方便跨專案識別任務歸屬。' },
          { label: '子任務進度', desc: '「◫ 2/5」代表有 5 個子任務，其中 2 個已完成。' },
          { label: '自動化標示', desc: '由自動化規則建立的任務，卡片右上角會顯示「⚡自動」徽章。' },
        ],
      },
      {
        title: '任務操作',
        icon: '🔧',
        items: [
          { label: '推進狀態', desc: '卡片底部顯示下一步操作按鈕（開始推進 / 送審 / 標示完成），一鍵推進任務到下個階段。' },
          { label: '開啟詳情', desc: '點擊卡片標題區域開啟右側滑出面板，可查看完整描述、子任務清單、附件與活動紀錄。' },
          { label: '刪除任務', desc: '點擊卡片右上角「⋯」選單選擇刪除，確認後執行軟刪除。' },
        ],
      },
      {
        title: '快速新增',
        icon: '➕',
        items: [
          { label: '欄位快速新增', desc: '點擊看板任一欄位底部的「＋ 新增任務」，輸入標題後按 Enter 快速建立。' },
          { label: '完整新增', desc: '點擊右上角「+ 新增任務」主按鈕開啟完整表單，可設定所有欄位。' },
        ],
      },
      {
        title: 'Hero 統計區',
        icon: '📊',
        items: [
          { label: '狀態計數', desc: '頁面頂部 Hero 區域顯示四個欄位的任務數量，以及整體的優先度分布（緊急/高/中/低數量）。' },
          { label: '自動化反饋', desc: 'Hero 下方的「自動化活動」時間軸顯示最近由自動化規則觸發的任務建立與狀態變更紀錄。' },
        ],
      },
    ],
    tips: [
      '看板視圖最有效的使用方式是：每天站立會議時，團隊一起看著看板討論哪些任務卡在審核中或進行中太久。',
      '如果「進行中」欄任務數量遠多於「審核中」和「已完成」，代表有任務正在等待外部資源或被阻塞，需要主動排查。',
      '利用「專案篩選」只看特定專案的任務，避免被其他專案的任務干擾，更聚焦地追蹤單一專案進度。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'gantt',
    icon: '📅',
    title: '時程規劃（甘特圖）',
    subtitle: '跨專案時間軸管理',
    description: '時程規劃以甘特圖呈現所有專案與任務的時間軸，讓你視覺化規劃、識別時程衝突，並對專案與任務的開始/截止日進行拖曳調整。',
    sections: [
      {
        title: '甘特圖介面',
        icon: '🏗️',
        items: [
          { label: '左側專案樹', desc: '顯示專案名稱與任務清單，點擊展開箭頭（▶）可展開/收合專案的任務列表。' },
          { label: '右側時間軸', desc: '以月份為單位的橫軸，任務以彩色橫條顯示於對應的時間區間，橫條顏色對應專案識別色。' },
          { label: '今日線', desc: '深紅色垂直線標示今天的位置，方便確認哪些任務應已開始或已逾期。' },
          { label: '橫條標籤', desc: '每個甘特橫條內顯示完成率（如「40% 完成·進行中」）讓你不用點擊就能知道進度。' },
        ],
      },
      {
        title: '縮放與導覽',
        icon: '🔍',
        items: [
          { label: '縮放比例', desc: '右上角提供「1個月 / 3個月 / 6個月 / 全部」縮放選項，切換後時間軸自動調整。' },
          { label: '全部展開', desc: '「全部展開」按鈕展開所有專案的任務列表；「全部收合」只顯示專案列。' },
          { label: '橫向捲動', desc: '滑鼠在時間軸區域橫向捲動可瀏覽更早或更晚的時間區間。' },
        ],
      },
      {
        title: '編輯任務',
        icon: '✏️',
        items: [
          { label: '點擊任務列', desc: '點擊左側任務列文字，彈出任務編輯視窗，可修改標題、開始日、截止日、狀態、指派人。' },
          { label: '編輯專案', desc: '點擊專案列右側鉛筆圖示，可修改專案的基本資訊與時間區間。' },
          { label: '儲存變更', desc: '在編輯視窗中修改後點擊「💾 儲存」，甘特圖即時更新對應橫條位置。' },
        ],
      },
      {
        title: '里程碑',
        icon: '🏳️',
        items: [
          { label: '菱形標記', desc: '里程碑以菱形（◇）顯示於時間軸上，已達成的里程碑為實心（◆）。' },
          { label: '新增里程碑', desc: '在專案詳情頁的「里程碑」標籤中新增，設定名稱與截止日後，甘特圖會自動顯示。' },
        ],
      },
      {
        title: '重新整理',
        icon: '🔄',
        items: [
          { label: '重新整理按鈕', desc: '當其他人在後台修改任務或專案時間後，點擊「🔄 重新整理」可更新甘特圖至最新狀態。' },
        ],
      },
    ],
    tips: [
      '建議每兩週回顧甘特圖，確認進行中任務的橫條右端（截止日）沒有超過今日線，若有需及時更新計畫。',
      '多個任務在同一時間段大量堆疊時，切換到「3個月」縮放比例能更清楚地看到時程分布。',
      '甘特圖特別適合展示給客戶或管理層，一張圖讓所有人一目了然整個專案的時間規劃。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'automation',
    upcoming: true,
    icon: '⚡',
    title: '自動化規則',
    subtitle: '工作流程自動化引擎',
    description: '自動化規則讓你定義「當 X 發生時，自動執行 Y」的觸發-動作規則，消除重複性的手動操作，確保流程標準化。',
    sections: [
      {
        title: '規則組成',
        icon: '🔧',
        items: [
          { label: '觸發條件 (Trigger)', desc: '定義何時啟動自動化。例如：「任務建立時」、「任務狀態變更為進行中時」、「截止日前 3 天」、「新表單提交時」。' },
          { label: '執行動作 (Action)', desc: '觸發後自動執行的操作。例如：「指派給特定成員」、「新增標籤」、「發送通知」、「建立子任務」。' },
          { label: '篩選條件 (Filter)', desc: '可選的條件過濾，確保規則只在特定情況觸發。例如：「僅當優先度為緊急時」、「僅限特定專案」。' },
        ],
      },
      {
        title: '建立規則',
        icon: '➕',
        items: [
          { label: '新增規則', desc: '點擊「＋ 新增規則」，依序設定規則名稱、觸發條件、（可選）篩選條件與執行動作。' },
          { label: '多重動作', desc: '一個觸發條件可設定多個動作，例如：「截止日前 1 天 → 發送通知 + 標記高優先度」。' },
          { label: '啟用/停用', desc: '建立後規則預設為啟用狀態，切換開關可隨時停用而不刪除規則。' },
        ],
      },
      {
        title: '常見規則範例',
        icon: '💡',
        items: [
          { label: '自動指派', desc: '「當表單提交時 → 自動建立任務並指派給客服組長」，適合處理客戶需求單。' },
          { label: '狀態提醒', desc: '「當任務進入審核中 → 發送通知給 PM」，確保審核工作不被漏接。' },
          { label: '逾期警示', desc: '「當截止日前 24 小時且任務仍在待辦 → 指派人收到緊急通知 + 優先度升為緊急」。' },
          { label: '完成追蹤', desc: '「當所有子任務完成 → 自動將父任務移至審核中」，減少手動推進。' },
        ],
      },
      {
        title: '執行記錄',
        icon: '📋',
        items: [
          { label: '觸發歷史', desc: '每條規則詳情頁顯示最近的觸發紀錄，包含觸發時間、來源與執行結果，方便除錯。' },
          { label: '錯誤排查', desc: '若規則執行失敗，紀錄中會顯示錯誤原因（如：指派的用戶不存在、目標專案已封存）。' },
        ],
      },
    ],
    tips: [
      '先從最重複、最耗時的手動操作下手，例如「每個新任務都要指派給某人」，這類規則效益最高。',
      '規則過多時，使用「標籤」分類規則（如「通知類」、「指派類」），方便管理與排查。',
      '定期查看執行記錄，確認規則是否如預期運作，特別是修改過觸發條件後。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'forms',
    upcoming: true,
    icon: '📝',
    title: '表單',
    subtitle: '需求收集與流程入口',
    description: '表單功能讓你建立需求收集表單，外部或內部成員可透過分享連結提交資料；管理員可在此管理表單清單、查看提交數與啟停用狀態。',
    sections: [
      {
        title: '建立表單',
        icon: '➕',
        items: [
          { label: '新增表單', desc: '點擊「＋ 新增表單」，輸入表單名稱與說明文字後建立。目前不支援自訂欄位，僅包含名稱與描述。' },
        ],
      },
      {
        title: '管理表單',
        icon: '📋',
        items: [
          { label: '表單列表', desc: '頁面以列表顯示所有表單，包含表單名稱、狀態（啟用/停用）、提交次數與最後提交時間。' },
          { label: '複製連結', desc: '點擊「複製連結」按鈕取得表單的唯一分享 URL，可傳送給任何人填寫（無需登入）。' },
          { label: '啟用／停用', desc: '可切換表單狀態；停用後分享連結無法繼續收集新提交。' },
          { label: '刪除', desc: '點擊刪除按鈕並確認後移除表單，此操作無法復原。' },
        ],
      },
    ],
    tips: [
      '表單最適合處理重複性的需求收集，如「IT 維修申請」、「Bug 回報」，統一入口讓追蹤更容易。',
      '分享連結複製後可貼入 Email、Line 群組或公告頁，讓團隊成員快速填寫。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'custom-fields',
    upcoming: true,
    icon: '🏷️',
    title: '自訂欄位',
    subtitle: '擴充任務資料結構',
    description: '自訂欄位讓你在系統預設的任務欄位之外，根據業務需求新增客製化欄位，使任務資料更貼近你的工作流程。',
    sections: [
      {
        title: '欄位類型',
        icon: '📐',
        items: [
          { label: '文字欄位（text）', desc: '適合儲存任意文字資訊，如「客戶名稱」、「需求來源」、「備註」。' },
          { label: '數字欄位（number）', desc: '儲存數值，適合「預估工時」、「數量」等。' },
          { label: '貨幣欄位（currency）', desc: '儲存金額數值，帶貨幣格式顯示，適合「預算金額」、「報價」。' },
          { label: '日期欄位（date）', desc: '日期選擇器，適合記錄「合約到期日」、「交付日期」等時間點。' },
          { label: '下拉選單（single_select）', desc: '定義固定選項列表，填寫者只能從清單中選擇。適合「地區」、「產品線」。' },
          { label: '核取方塊（checkbox）', desc: '是/否的布林值欄位，適合「是否緊急」、「是否需要審查」。' },
          { label: '成員欄位（people）', desc: '從成員清單中選擇一或多位成員，適合「相關利害關係人」、「審核者」。' },
        ],
      },
      {
        title: '建立與管理',
        icon: '⚙️',
        items: [
          { label: '新增欄位', desc: '點擊「＋ 新增自訂欄位」，選擇類型、輸入欄位名稱，並選擇適用範圍：任務（task）或專案（project）。' },
          { label: '適用範圍', desc: '「任務」範圍的欄位出現在任務編輯表單；「專案」範圍的欄位出現在專案編輯表單；兩者獨立管理。' },
          { label: '編輯/刪除', desc: '點擊欄位右側的「✏️」可修改欄位名稱，點擊「🗑️」刪除欄位。刪除後已有資料也一同移除，不可復原。' },
        ],
      },
      {
        title: '在任務中使用',
        icon: '✏️',
        items: [
          { label: '填寫欄位', desc: '在任務詳情頁的「自訂欄位」區塊填寫各欄位值，填寫後即時儲存。' },
          { label: '列表視圖顯示', desc: '任務列表視圖可加入自訂欄位為顯示欄，方便在清單中直接看到欄位值。' },
          { label: '篩選條件', desc: '自訂欄位可作為篩選條件使用，例如「顯示所有客戶等級為 VIP 的任務」。' },
        ],
      },
    ],
    tips: [
      '欄位設計原則：只建立你真的會查看與使用的欄位，過多的自訂欄位會讓任務表單變得繁瑣。',
      '下拉選單欄位的選項定義後也可以修改，但修改選項名稱會影響所有已使用該選項的任務紀錄。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'timelog',
    icon: '⏱️',
    title: '工時記錄',
    subtitle: '時間追蹤與工時分析',
    description: '工時記錄讓成員記錄每個任務花費的實際時間，管理者可匯整工時報告，用於成本核算、效率分析與客戶計費。',
    sections: [
      {
        title: '記錄工時',
        icon: '⏺️',
        items: [
          { label: '新增記錄', desc: '點擊右上角「+ 新增記錄」開啟表單，填入專案、任務名稱、時數與備註後送出。' },
          { label: '時數填寫', desc: '時數精確到小數（如 1.5 = 1.5 小時），系統不提供即時計時器，請事後手動填入。' },
          { label: '工時說明', desc: '每筆工時記錄可附加說明文字，例如「完成 API 串接」，方便日後查閱與對帳。' },
          { label: '編輯/刪除', desc: '在工時記錄列表中，點擊行尾的「✏️」可修改，點擊「🗑️」可刪除該筆記錄。' },
        ],
      },
      {
        title: '工時總覽',
        icon: '📊',
        items: [
          { label: '個人工時', desc: '工時記錄頁顯示你本週、本月的工時統計，以及各任務的時間分配比例。' },
          { label: '專案工時', desc: '管理者可查看某專案所有成員的工時彙整，計算專案總投入時數。' },
          { label: '成員工時', desc: '依成員統計工時，方便進行薪資核算或外包計費。' },
        ],
      },
      {
        title: '匯出報告',
        icon: '📥',
        items: [
          { label: '週報/月報', desc: '選擇時間區間後點擊「匯出工時報告」，以 CSV 或 PDF 格式輸出詳細工時資料。' },
          { label: '客戶計費', desc: '匯出的工時報告可作為客戶帳單的依據，包含任務名稱、成員、時數與說明。' },
        ],
      },
    ],
    tips: [
      '養成完成任務後立即記錄工時的習慣，比事後回填更準確；工時數據也會讓未來的估算更有依據。',
      '若團隊不需要精確計費，工時記錄最大的價值是識別「哪類任務比預期花更多時間」，用於改善估算能力。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'settings',
    icon: '⚙️',
    title: '設定',
    subtitle: '系統與個人化設定',
    description: '設定頁分為六個標籤：公司資訊、個人資料、通知偏好、整合服務、系統狀態、資料統計，涵蓋帳號與組織的各項管理功能。',
    sections: [
      {
        title: '公司資訊',
        icon: '🏢',
        items: [
          { label: '工作區資訊', desc: '修改公司／組織名稱，這些資訊會顯示在報告頁面的頂部（管理員可修改）。' },
        ],
      },
      {
        title: '個人資料',
        icon: '👤',
        items: [
          { label: '個人資訊', desc: '修改顯示名稱、電子郵件、部門、電話、職稱（jobTitle），以及查看加入日期。' },
        ],
      },
      {
        title: '通知偏好',
        icon: '🔔',
        items: [
          { label: '通知設定', desc: '設定哪些事件觸發系統內通知（收件匣）或 Email 通知，可依類型分別開關。' },
        ],
      },
      {
        title: '整合服務',
        icon: '🔗',
        items: [
          { label: '外部服務連線', desc: '管理與外部服務（如 Microsoft 365）的連線狀態與授權設定。' },
        ],
      },
      {
        title: '系統狀態',
        icon: '🖥️',
        items: [
          { label: '服務狀態', desc: '查看各後端服務的運作狀態與健康檢查結果。' },
        ],
      },
      {
        title: '資料統計',
        icon: '📊',
        items: [
          { label: '系統數據', desc: '顯示系統整體的資料量統計，如任務數、成員數、專案數等彙整資訊。' },
        ],
      },
    ],
    tips: [
      '深色／淺色模式的切換開關位於左側邊欄底部，而非在設定頁面內。',
      '若你是團隊管理員，建議定期審查整合服務連線狀態，確保外部服務授權未過期。',
    ],
  },

  // ══════════════════════════════════════════════════════
  {
    id: 'permissions',
    icon: '🔑',
    title: '權限說明',
    subtitle: '管理員 vs 成員角色差異',
    description: '系統內建三種角色：系統管理員（Admin）、專案經理（PM）與一般成員（Member），各角色擁有不同的功能存取範圍。',
    sections: [
      {
        title: '管理員（Admin）',
        icon: '👑',
        items: [
          { label: '完整功能存取', desc: '管理員擁有系統內所有功能的完整存取權限，包括建立、編輯、刪除任何專案與任務。' },
          { label: '成員管理', desc: '可邀請新成員（輸入 Email 發送邀請）、變更成員角色（升級/降級）、停用或刪除成員帳號。' },
          { label: '系統設定', desc: '可修改公司資訊、工作區名稱，以及管理整合服務、系統狀態與資料統計。' },
          { label: '自訂欄位管理', desc: '可建立、編輯、刪除自訂欄位。' },
          { label: '自動化規則', desc: '可建立與管理全域自動化規則。' },
        ],
      },
      {
        title: '專案經理（PM）',
        icon: '📋',
        items: [
          { label: '僅限自己的專案', desc: 'PM 只能編輯、刪除、管理「自己建立」的專案（ownerId / createdById = 當前帳號），其他人的專案僅可讀取。' },
          { label: '任務管理', desc: '在自己的專案內可新增、編輯、刪除任務，以及指派任務給成員、管理子任務與待辦清單。' },
          { label: '專案成員管理', desc: '在自己的專案詳情頁，可透過「＋ 加入成員」按鈕新增成員，或點擊成員 pill 上的 × 移除成員。' },
          { label: '報告（自己的專案）', desc: '可進入報告頁，但「所屬專案」篩選僅列出本人負責的專案，不顯示其他人的資料。' },
          { label: '多專案組合', desc: '可建立、管理與刪除多專案組合（Portfolio），以及填寫專案週報、切換健康度。' },
          { label: '不可使用', desc: '無法管理成員帳號（邀請/角色變更）、無法永久刪除專案、無法修改系統層級設定。' },
        ],
      },
      {
        title: '一般成員（Member）',
        icon: '👤',
        items: [
          { label: '查看與參與', desc: '可查看被加入的所有專案及其任務，但無法建立、編輯或刪除任務。' },
          { label: '完成任務', desc: '可將自己負責的任務標記為完成（推進狀態），勾選子任務與待辦事項。' },
          { label: '留言與協作', desc: '可在任意任務中留言、@提及成員、查看活動紀錄。' },
          { label: '我的任務', desc: '可在「我的任務」中查看指派給自己的任務清單、調整排序、更新進度。' },
          { label: '工時記錄', desc: '可對自己被指派的任務記錄工時、編輯自己的工時紀錄。' },
          { label: '不可使用', desc: '無法建立/編輯/刪除任務、無法查看報告、無法管理專案成員、無法管理成員帳號或修改系統設定。' },
        ],
      },
      {
        title: '功能權限對照表',
        icon: '📋',
        tableMode: true,
        items: [
          { label: '建立專案',                   cols: ['✅', '✅', '✅'] },
          { label: '編輯 / 刪除專案',            cols: ['✅ 全部', '✅ 僅自己的', '❌'] },
          { label: '永久刪除專案',              cols: ['✅', '❌', '❌'] },
          { label: '管理專案成員',              cols: ['✅ 全部', '✅ 僅自己的', '❌'] },
          { label: '建立 / 編輯 / 刪除任務',   cols: ['✅', '✅', '❌'] },
          { label: '完成任務 / 勾選待辦',     cols: ['✅', '✅', '✅'] },
          { label: '任務留言',                   cols: ['✅', '✅', '✅'] },
          { label: '查看報告',                   cols: ['✅ 全公司', '✅ 僅自己的', '❌'] },
          { label: '多專案組合（Portfolio）', cols: ['✅', '✅', '❌'] },
          { label: '自動化規則 / 自訂欄位',   cols: ['✅', '✅', '❌'] },
          { label: '工時記錄',                   cols: ['✅', '✅', '✅'] },
          { label: '管理成員帳號',              cols: ['✅', '❌', '❌'] },
          { label: '系統與工作區設定',        cols: ['✅', '❌', '❌'] },
        ],
      },
      {
        title: '角色管理方式',
        icon: '🔧',
        items: [
          { label: '如何變更角色', desc: '管理員進入「權限管理」頁面，找到目標成員，點擊角色欄位即可選擇新角色（admin / pm / member）。' },
          { label: '第一位管理員', desc: '系統建立時的第一個帳號自動成為管理員；後續帳號預設為成員角色。' },
          { label: '角色立即生效', desc: '變更角色後立即生效，成員下次操作時即套用新權限，無需重新登入。' },
        ],
      },
    ],
    tips: [
      '建議設定 1–2 位管理員，對需要跨專案管理的人指派 PM 角色。PM 僅能操作自己建立的專案，其餘用成員角色即可。',
      '成員無法建立任務，但可完成任務、勾選待辦事項與留言，PM 可指派具體工作給成員執行。',
      '管理員可在「權限管理」頁面隨時調整角色，角色變更即時生效。',
    ],
  },
];

// ── 主元件 ──────────────────────────────────────────────
export default function HelpPanel({ open, onClose, currentPage }) {
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState({});

  // 根據當前頁面自動選中
  const activeId = selectedId || PAGE_MAP[currentPage] || 'home';
  const activePage = HELP_DATA.find(p => p.id === activeId) || HELP_DATA[0];

  const filtered = useMemo(() => {
    if (!search.trim()) return HELP_DATA;
    const q = search.toLowerCase();
    return HELP_DATA.filter(p =>
      p.title.includes(q) || p.subtitle.includes(q) ||
      p.description.includes(q) ||
      p.sections.some(s => s.title.includes(q) ||
        s.items.some(i => i.label.includes(q) || i.desc.includes(q)))
    );
  }, [search]);

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      {/* 遮罩 */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(4px)',
          pointerEvents: 'auto',
          animation: 'helpFadeIn 0.22s ease',
        }}
      />

      {/* 主面板 */}
      <div style={{
        position: 'relative',
        width: 820, maxWidth: '95vw', maxHeight: '90vh',
        background: 'var(--xc-surface)',
        borderRadius: 16,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.08)',
        pointerEvents: 'auto',
        animation: 'helpSlideIn 0.26s ease',
      }}>

        {/* ── 頂部標題 ── */}
        <div style={{
          padding: '18px 22px 16px',
          borderBottom: '1px solid var(--xc-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'color-mix(in srgb, var(--xc-brand) 12%, var(--xc-surface))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17,
            }}>📖</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--xc-text)' }}>使用說明</div>
              <div style={{ fontSize: 13, color: 'var(--xc-text-muted)', marginTop: 1 }}>xCloudPMIS 功能完整指南</div>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: 'none',
            background: 'var(--xc-surface-muted)', color: 'var(--xc-text-muted)',
            cursor: 'pointer', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* ── 搜尋欄 ── */}
        <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--xc-border)', flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋功能說明…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 12px 8px 36px',
              border: '1px solid var(--xc-border)', borderRadius: 8,
              background: 'var(--xc-surface-soft)', color: 'var(--xc-text)',
              fontSize: 15, outline: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: '11px center',
            }}
          />
        </div>

        {/* ── 主體（導覽 + 內容） ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* 左側導覽 */}
          <div style={{
            width: 190, borderRight: '1px solid var(--xc-border)',
            overflowY: 'auto', flexShrink: 0, padding: '8px 0',
          }}>
            {(search ? filtered : HELP_DATA).map(page => (
              <button
                key={page.id}
                onClick={() => { setSelectedId(page.id); setSearch(''); }}
                style={{
                  width: '100%', padding: '9px 16px',
                  display: 'flex', alignItems: 'center', gap: 9,
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: activeId === page.id
                    ? 'color-mix(in srgb, var(--xc-brand) 10%, var(--xc-surface))'
                    : 'transparent',
                  borderLeft: activeId === page.id
                    ? '3px solid var(--xc-brand)'
                    : '3px solid transparent',
                  transition: 'all 0.12s',
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>{page.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{
                      fontSize: 14, fontWeight: activeId === page.id ? 700 : 500,
                      color: activeId === page.id ? 'var(--xc-brand)' : 'var(--xc-text-soft)',
                      lineHeight: 1.3,
                    }}>{page.title}</div>
                    {page.upcoming && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 5px',
                        borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#d97706',
                        border: '1px solid rgba(245,158,11,0.35)', lineHeight: 1.6, whiteSpace: 'nowrap',
                      }}>開發中</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--xc-text-muted)', marginTop: 1, lineHeight: 1.3 }}>
                    {page.subtitle}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* 右側說明內容 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {/* 頁面標題 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 26 }}>{activePage.icon}</span>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: 'var(--xc-text)' }}>
                    {activePage.title}
                  </h2>
                  <div style={{ fontSize: 14, color: 'var(--xc-brand)', fontWeight: 600, marginTop: 2 }}>
                    {activePage.subtitle}
                  </div>
                </div>
              </div>
              {activePage.upcoming && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 14px', marginBottom: 10,
                  background: 'rgba(254,243,199,0.4)', border: '1px solid rgba(245,158,11,0.35)',
                  borderRadius: 10, borderLeft: '3px solid #f59e0b',
                }}>
                  <span style={{ fontSize: 16, marginTop: 1 }}>🚧</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#d97706' }}>此功能目前仍在開發中</div>
                    <div style={{ fontSize: 13, color: '#92400e', marginTop: 2 }}>以下為規劃功能介紹，實際上線時間請關注系統公告。</div>
                  </div>
                </div>
              )}
              <p style={{
                margin: 0, fontSize: 15, color: 'var(--xc-text-soft)',
                lineHeight: 1.7, padding: '12px 14px',
                background: 'var(--xc-surface-soft)',
                borderRadius: 10, borderLeft: '3px solid var(--xc-brand)',
              }}>
                {activePage.description}
              </p>
            </div>

            {/* 功能區塊 */}
            {activePage.sections.map((section, si) => {
              const sKey = `${activePage.id}-${si}`;
              const isExpanded = expandedSections[sKey] !== false; // 預設展開
              return (
                <div key={sKey} style={{ marginBottom: 14 }}>
                  <button
                    onClick={() => toggleSection(sKey)}
                    style={{
                      width: '100%', padding: '10px 14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'var(--xc-surface-muted)',
                      border: '1px solid var(--xc-border)',
                      borderRadius: isExpanded ? '10px 10px 0 0' : '10px',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{section.icon}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--xc-text)' }}>
                        {section.title}
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: 'var(--xc-text-muted)',
                        background: 'var(--xc-surface-strong)',
                        padding: '1px 7px', borderRadius: 99,
                      }}>{section.items.length}</span>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--xc-text-muted)', transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                  </button>
                  {isExpanded && (
                    <div style={{
                      border: '1px solid var(--xc-border)', borderTop: 'none',
                      borderRadius: '0 0 10px 10px', overflow: 'hidden',
                    }}>
                      {section.tableMode ? (
                        <>
                          {/* 表頭 */}
                          <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 72px 72px 60px',
                            gap: 0, padding: '8px 16px',
                            background: 'var(--xc-surface-muted)',
                            borderBottom: '1px solid var(--xc-border)',
                          }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--xc-text-muted)' }}>功能</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--xc-text-muted)', textAlign: 'center' }}>管理員</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--xc-text-muted)', textAlign: 'center' }}>PM</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--xc-text-muted)', textAlign: 'center' }}>成員</div>
                          </div>
                          {section.items.map((item, ii) => (
                            <div key={ii} style={{
                              display: 'grid', gridTemplateColumns: '1fr 72px 72px 60px',
                              gap: 0, padding: '9px 16px',
                              borderBottom: ii < section.items.length - 1 ? '1px solid var(--xc-border)' : 'none',
                              background: ii % 2 === 0 ? 'var(--xc-surface)' : 'var(--xc-surface-soft)',
                              alignItems: 'center',
                            }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--xc-text)' }}>{item.label}</div>
                              {(item.cols || []).map((col, ci) => {
                                const [icon, note] = col.split(' ');
                                const isOk = icon === '✅';
                                return (
                                  <div key={ci} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                    <span style={{ fontSize: 15 }}>{icon}</span>
                                    {note && <span style={{ fontSize: 10, fontWeight: 600, color: isOk ? 'var(--xc-brand)' : 'var(--xc-text-muted)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{note}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </>
                      ) : (
                        section.items.map((item, ii) => (
                          <div
                            key={ii}
                            style={{
                              padding: '11px 16px',
                              borderBottom: ii < section.items.length - 1 ? '1px solid var(--xc-border)' : 'none',
                              display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12,
                              alignItems: 'start',
                              background: ii % 2 === 0 ? 'var(--xc-surface)' : 'var(--xc-surface-soft)',
                            }}
                          >
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--xc-text)', paddingTop: 1 }}>
                              {item.label}
                            </div>
                            <div style={{ fontSize: 14, color: 'var(--xc-text-soft)', lineHeight: 1.6 }}>
                              {item.desc}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* 小技巧 */}
            {activePage.tips && activePage.tips.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--xc-text)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>💡</span> 使用小技巧
                </div>
                {activePage.tips.map((tip, ti) => (
                  <div key={ti} style={{
                    display: 'flex', gap: 10, marginBottom: 8,
                    padding: '10px 14px',
                    background: 'color-mix(in srgb, var(--xc-warning) 8%, var(--xc-surface))',
                    border: '1px solid color-mix(in srgb, var(--xc-warning) 22%, var(--xc-border))',
                    borderRadius: 8,
                  }}>
                    <span style={{ fontSize: 14, color: 'var(--xc-warning)', fontWeight: 800, flexShrink: 0, marginTop: 1 }}>
                      {ti + 1}.
                    </span>
                    <span style={{ fontSize: 14, color: 'var(--xc-text-soft)', lineHeight: 1.6 }}>{tip}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 底部版本資訊 */}
            <div style={{
              marginTop: 28, paddingTop: 16,
              borderTop: '1px solid var(--xc-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: 13, color: 'var(--xc-text-muted)' }}>
                xCloudPMIS 企業級專案管理系統
              </div>
              <div style={{ fontSize: 13, color: 'var(--xc-text-muted)' }}>
                文件版本 v2.0
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes helpFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes helpSlideIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
