import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Copy, 
  Star, 
  Settings, 
  Info,
  Moon,
  Sun,
  Shield, 
  Sword, 
  Library, 
  X,
  ChevronRight,
  Flame,
  Zap,
  Anchor,
  Upload,
  Image as ImageIcon,
  FolderPlus,
  Check,
  Edit2,
  ArrowRightLeft,
  Palette
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import localforage from 'localforage';
import Cropper from 'react-easy-crop';
import getCroppedImg from './lib/cropImage';
import { createBackup, parseBackup, restoreBackup } from './lib/backup';
import { flushUserData, loadUserData, readAutomaticBackups, saveUserData, updateUserData, type AutomaticBackup } from './lib/userDataStorage';
import { addPackHistory, emptyPackHistory, type PackHistory } from './lib/packHistory';
import type { PackReward } from './lib/cardPacks';
import type { CardPackKind } from './lib/assetCatalog';
import UserDataSaveStatus from './components/UserDataSaveStatus';
import { generateLightModeColors } from './lib/colorUtils';
import { renderDeckImage, renderDeckMiniImage, downloadDeckImage } from './lib/deckRenderer';
import { decodeDeckCode, findCardsByImportId } from './lib/deckCode';
import { DEFAULT_DECK_RULES, deckModeLabel, deckRuleSet, validateDeck, type DeckRuleSet } from './lib/deckRules';
import { extractDeckCodeFromText, inferDeckTitleFromText } from './lib/deckImport';
import ImageDownloadProgress from './components/ImageDownloadProgress';
import { handleDialogKeys, useDismissiblePanel, useModalFocus } from './lib/dialogKeyboard';
import CardLibrary from './components/CardLibrary';
import useDeckGridLayout from './lib/useDeckGridLayout';
import CardPacks from './components/CardPacks';
import { resetUsageTips } from './lib/usageTips';
import TableclothBackground from './components/TableclothBackground';
import TableclothChoice from './components/TableclothChoice';
import CardDetailModal from './components/CardDetailModal';
import type { CardDetailOrigin } from './lib/cardDetailOrigin';
import { revealDetailItem, type CardDetailItem } from './lib/cardDetailPaging';
import DeckBuilder, { type BuilderDeck } from './components/DeckBuilder';
import DeckCardStrip, { DeckHeadquartersStrip } from './components/DeckCardStrip';
import DeckCountIndicator from './components/DeckCountIndicator';
import DeckCostChart from './components/DeckCostChart';
import ReservedBadge from './components/ReservedBadge';
import SearchClearButton from './components/SearchClearButton';
import NewDeckDialog from './components/NewDeckDialog';
import DeckImageImport from './components/DeckImageImport';
import DeckImagePage from './components/DeckImagePage';
import { saveDeckImage } from './lib/deckImageCache';
import DeckFolders from './components/DeckFolders';
import AboutPage from './components/AboutPage';
import CardDataUpdater from './components/CardDataUpdater';
import CardCacheManager from './components/CardCacheManager';
import CustomSelect from './components/CustomSelect';
import { nationOptions } from './components/CardFilterSelects';
import { loadCardDatabase, type KardsCardRecord } from './types/card';
import { CARD_BACK_CATEGORIES, CARD_BACKS, DEFAULT_CARD_BACK, DEFAULT_TABLECLOTH, TABLECLOTHS, USER_TABLECLOTHS, cardBackForDeck, cardBackIsAvailable, defaultCardBackForNation, headquartersForDeck, headquartersOptions, resolveSelectedTablecloth, tableclothForHeadquarters, type HeadquartersAsset } from './lib/cardAssets';
import { factionAsset, factionIcon, LOGOS } from './lib/assetCatalog';

// --- Types ---
type Nation = 'Germany' | 'Soviet' | 'USA' | 'Japan' | 'Britain' | 'Finland' | 'Italy' | 'France' | 'Poland' | 'Anzac';

interface Deck {
  id: string;
  name: string;
  mainNation: Nation;
  allyNation?: Nation;
  code: string;
  isFavorite: boolean;
  cardBackUrl?: string;
  cardBackScope?: 'common' | 'main' | 'ally';
  cardBackNation?: string;
  headquartersId?: string;
  totalCards: number;
  warnings: string[];
  isArena: boolean;
  tags?: string[];
  ruleSet?: DeckRuleSet;
}

interface Collection {
  id: string;
  name: string;
  deckIds: string[];
  isFavorite: boolean;
  createdAt: number;
}

interface AvailableCardBack {
  id: string;
  name: string;
  url: string;
  isCustomCard: boolean;
  file?: string;
  scope?: 'common' | 'main' | 'ally';
  nation?: string;
}

interface AvailableCardBackCategory {
  id: string;
  name: string;
  isCustom?: boolean;
  backs: AvailableCardBack[];
}

interface AppSettings {
  borderRadius: number;
  importBoxOpacity: number;
  logoSize: number;
  logoOpacity: number;
  displayMode: 'dark' | 'light' | 'system';
  lightThemeColor: string;
  uiScale: number;
  deckGap: number;
  showDeckFolders: boolean;
  cardDetailMode: 'modal' | 'sidebar';
}

interface ClipboardDeckCandidate {
  sourceText: string;
  code: string;
  name: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  borderRadius: 6,
  importBoxOpacity: 0.6,
  logoSize: 450,
  logoOpacity: 0.25,
  displayMode: 'dark',
  lightThemeColor: '#dcd7c9',
  uiScale: 1.0,
  deckGap: 0.5,
  showDeckFolders: false,
  cardDetailMode: 'modal'
};

// --- Icons & Labels ---
const ID_TO_NATION: Record<number, Nation> = {
  1: 'Germany',
  2: 'Britain',
  3: 'Japan',
  4: 'Soviet',
  5: 'USA',
  6: 'France',
  7: 'Italy',
  8: 'Poland',
  9: 'Finland',
  10: 'Anzac'
};

const ERROR_LOCALE: Record<string, string> = {
  EMPTY_INPUT: '卡组代码不能为空',
  INVALID_TYPE: '无效的传入类型',
  INVALID_PREFIX: '未找到 %% 前缀或前缀错误',
  INVALID_COUNTRY_HEADER: '非法的国家头部格式',
  INVALID_COUNTRY_CODE: '非法的国家代码数字',
  UNKNOWN_COUNTRY: '未知的国家代码',
  MISSING_SEPARATOR: '缺少分隔符 |',
  EXTRA_SEPARATOR: '包含多个分隔符 |',
  INVALID_GROUP_COUNT: '卡牌分组格式错误（应有3个分号）',
  INVALID_CARD_ID_LENGTH: '卡牌ID长度错误',
  INVALID_WHITESPACE: '卡牌片段不能包含空格或换行等',
  DUPLICATE_CARD_ID: '存在重复的卡牌ID',
  CARD_COUNT_EXCEEDS_4: '同一张卡牌累计超过 4 张',
};

const NATION_DATA: Record<Nation, { label: string, color: string, flag: string, isMainAllowed: boolean, icon: string }> = {
  Germany: { 
    label: '德', color: '#3d3d3d', flag: 'de', isMainAllowed: true,
    icon: factionIcon('Germany')
  },
  Britain: { 
    label: '英', color: '#002366', flag: 'gb', isMainAllowed: true,
    icon: factionIcon('Britain')
  },
  Japan: { 
    label: '日', color: '#bc002d', flag: 'jp', isMainAllowed: true,
    icon: factionIcon('Japan')
  },
  Soviet: { 
    label: '苏', color: '#cc0000', flag: 'su', isMainAllowed: true,
    icon: factionIcon('Soviet')
  },
  USA: { 
    label: '美', color: '#3c3b6e', flag: 'us', isMainAllowed: true,
    icon: factionIcon('USA')
  },
  France: { label: '法', color: '#0055A4', flag: 'fr', isMainAllowed: false, icon: factionIcon('France') },
  Italy: { label: '意', color: '#008C45', flag: 'it', isMainAllowed: false, icon: factionIcon('Italy') },
  Poland: { label: '波', color: '#DC143C', flag: 'pl', isMainAllowed: false, icon: factionIcon('Poland') },
  Finland: { label: '芬', color: '#003580', flag: 'fi', isMainAllowed: false, icon: factionIcon('Finland') },
  Anzac: { label: '澳', color: '#9E6F34', flag: 'an', isMainAllowed: false, icon: factionIcon('Anzac') },
};

const NATION_FLAG_ASSETS = Object.fromEntries(Object.entries(NATION_DATA).map(([nation, data]) => [data.flag, factionAsset(nation).flag!]));

const getFlagUrl = (nationCode: string) => {
  return NATION_FLAG_ASSETS[nationCode] || NATION_FLAG_ASSETS.de;
};

const parseDeck = (code: string) => {
  const decoded = decodeDeckCode(code);
  const mainNation = decoded.mainNation as Nation, allyNation = decoded.allyNation as Nation;
  const totalCards = [...decoded.counts.values()].reduce((sum, count) => sum + count, 0);
  const warnings = totalCards === 39 ? [] : [`卡组当前 ${totalCards + 1} 张，默认要求 40 张（含总部）`];
  if (!NATION_DATA[mainNation].isMainAllowed) warnings.push('所选主国不在五个主要国家中');
  const defaultName = `${NATION_DATA[mainNation].label}${mainNation === allyNation ? '' : NATION_DATA[allyNation].label}卡组`;
  return { mainNation, allyNation, totalCards, warnings, defaultName };
};

const INITIAL_DECKS: Deck[] = [];

export default function App() {
  useModalFocus();
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [backupBusy, setBackupBusy] = useState(false);
  const [automaticBackups, setAutomaticBackups] = useState<AutomaticBackup[] | null>(null);
  const [automaticBackupIndex, setAutomaticBackupIndex] = useState(0);
  const [packHistory, setPackHistory] = useState<PackHistory>(emptyPackHistory);
  const [decks, setDecks] = useState<Deck[]>(INITIAL_DECKS);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [cardDatabase, setCardDatabase] = useState<KardsCardRecord[]>([]);
  const [cardDatabaseLoading, setCardDatabaseLoading] = useState(true);
  const [cardDatabaseError, setCardDatabaseError] = useState<string | null>(null);

  // --- State for Preloading ---
  useEffect(() => {
    Object.values(NATION_DATA).forEach(data => {
      const img = new Image();
      img.src = data.icon;
    });
  }, []);

  useEffect(() => {
    loadCardDatabase()
      .then((loadedCards) => setCardDatabase(loadedCards))
      .catch((error) => setCardDatabaseError(error instanceof Error ? error.message : '本地卡牌目录加载失败'))
      .finally(() => setCardDatabaseLoading(false));
  }, []);

  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [hoveredDeckId, setHoveredDeckId] = useState<string | null>(null);
  const deckHoverOpenTimer = useRef<number | null>(null);
  const deckHoverCloseTimer = useRef<number | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showNewDeckModal, setShowNewDeckModal] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [importHeadquartersId, setImportHeadquartersId] = useState<string | undefined>();
  const [importCardBackId, setImportCardBackId] = useState<string | undefined>();
  const [importImageBusy, setImportImageBusy] = useState(false);
  const cancelImageImport = useRef<(() => void) | null>(null);
  const [importName, setImportName] = useState('');
  const [clipboardDeckCandidate, setClipboardDeckCandidate] = useState<ClipboardDeckCandidate | null>(null);
  const lastClipboardPromptRef = useRef<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<'decks' | 'cards' | 'packs' | 'builder' | 'about' | 'settings' | 'deck-image'>('decks');
  const deckGrid = useDeckGridLayout(dataLoaded && activeMenu === 'decks' && !settings.showDeckFolders, settings.uiScale, settings.deckGap);
  const [aboutReturnMenu, setAboutReturnMenu] = useState<'decks' | 'cards' | 'packs' | 'builder' | 'settings' | 'deck-image'>('decks');
  const [settingsReturnMenu, setSettingsReturnMenu] = useState<'decks' | 'cards' | 'packs' | 'builder' | 'about' | 'deck-image'>('decks');
  const settingsPageRef = useRef<HTMLElement>(null);
  useEffect(() => { if (activeMenu === 'settings') settingsPageRef.current?.focus(); }, [activeMenu]);
  const [builderDeck, setBuilderDeck] = useState<BuilderDeck | null>(null);
  const builderExitRequest = useRef<((afterLeave?: () => void) => void) | null>(null);
  const [builderRevision, setBuilderRevision] = useState(0);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [showCardBackModal, setShowCardBackModal] = useState<string | null>(null);
  const [showHeadquartersModal, setShowHeadquartersModal] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<KardsCardRecord | null>(null);
  const [detailHeadquarters, setDetailHeadquarters] = useState<HeadquartersAsset | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<CardDetailOrigin | undefined>();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [addingTagToDeckId, setAddingTagToDeckId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMainNation, setFilterMainNation] = useState<Nation | 'All'>('All');
  const [filterAllyNation, setFilterAllyNation] = useState<Nation | 'All'>('All');
  const [filterTag, setFilterTag] = useState<string | 'All'>('All');

  const clearDeckHoverOpen = () => {
    if (deckHoverOpenTimer.current !== null) window.clearTimeout(deckHoverOpenTimer.current);
    deckHoverOpenTimer.current = null;
  };
  const clearDeckHoverClose = () => {
    if (deckHoverCloseTimer.current !== null) window.clearTimeout(deckHoverCloseTimer.current);
    deckHoverCloseTimer.current = null;
  };
  const hoverDeck = (id: string) => {
    clearDeckHoverOpen();
    clearDeckHoverClose();
    if (selectedDeckId || activeMenu !== 'decks' || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    deckHoverOpenTimer.current = window.setTimeout(() => {
      setHoveredDeckId(id);
      deckHoverOpenTimer.current = null;
    }, 300);
  };
  const selectDeck = (id: string) => {
    clearDeckHoverOpen();
    clearDeckHoverClose();
    if (selectedDeckId === id) return;
    setHoveredDeckId(null);
    setSelectedDeckId(id);
  };
  const scheduleDeckHoverClose = () => {
    clearDeckHoverOpen();
    if (showCardBackModal || showHeadquartersModal) return;
    if (document.querySelector('.custom-select-popover')) return;
    clearDeckHoverClose();
    deckHoverCloseTimer.current = window.setTimeout(() => { setHoveredDeckId(null); deckHoverCloseTimer.current = null; }, 180);
  };
  const closeDeckDetails = React.useCallback(() => {
    const opener = document.querySelector<HTMLButtonElement>('[aria-label^="选择卡组 "][aria-pressed="true"]');
    setSelectedDeckId(null);
    setHoveredDeckId(null);
    setAddingTagToDeckId(null);
    if (deckHoverOpenTimer.current !== null) window.clearTimeout(deckHoverOpenTimer.current);
    deckHoverOpenTimer.current = null;
    if (deckHoverCloseTimer.current !== null) window.clearTimeout(deckHoverCloseTimer.current);
    deckHoverCloseTimer.current = null;
    requestAnimationFrame(() => { if (opener?.isConnected) opener.focus(); });
  }, []);
  useEffect(() => () => { clearDeckHoverOpen(); clearDeckHoverClose(); }, []);
  useEffect(() => {
    clearDeckHoverOpen();
    if (activeMenu !== 'decks' || selectedDeckId) {
      clearDeckHoverClose();
      setHoveredDeckId(null);
    }
  }, [activeMenu, selectedDeckId]);
  const deckDetailsRef = useDismissiblePanel(activeMenu === 'decks' && !!(selectedDeckId || hoveredDeckId), closeDeckDetails, event => {
    if (event.target instanceof Element && event.target.closest('[aria-label^="选择卡组 "]')) return;
    clearDeckHoverOpen();
    clearDeckHoverClose();
    setSelectedDeckId(null);
    setHoveredDeckId(null);
    setAddingTagToDeckId(null);
  });

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (event.key === 'Escape' && activeMenu === 'about') {
        event.preventDefault(); setActiveMenu(aboutReturnMenu);
        requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[aria-label="关于"]')?.focus());
      } else if (event.key === 'Escape' && activeMenu === 'decks') {
        event.preventDefault();
        if (selectedDeckId || hoveredDeckId) closeDeckDetails();
        else if (searchQuery) setSearchQuery('');
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [activeMenu, aboutReturnMenu, searchQuery, selectedDeckId, hoveredDeckId, closeDeckDetails]);
  
  const [customCategories, setCustomCategories] = useState<{id: string, name: string, backs: {id: string, url: string, name: string}[]}[]>([]);

  useEffect(() => {
    if (activeMenu === 'deck-image') return;
    let detecting = false;
    let cancelled = false;
    const readClipboardText = async () => {
      if (window.kardsDesktop?.readClipboardText) {
        return window.kardsDesktop.readClipboardText();
      }

      if (navigator.clipboard?.readText) {
        return navigator.clipboard.readText();
      }

      return '';
    };

    const detectClipboardDeck = async () => {
      if (!document.hasFocus() || detecting) return;
      detecting = true;

      try {
        const clipboardText = await readClipboardText();
        if (cancelled || !clipboardText.trim()) return;

        const deckCode = extractDeckCodeFromText(clipboardText);
        if (!deckCode || deckCode === lastClipboardPromptRef.current) return;

        if (localStorage.getItem('kards_last_clipboard_deck_code') === deckCode) return;

        const { defaultName } = parseDeck(deckCode);
        const inferredName = inferDeckTitleFromText(clipboardText, deckCode);
        lastClipboardPromptRef.current = deckCode;
        localStorage.setItem('kards_last_clipboard_deck_code', deckCode);
        setClipboardDeckCandidate({
          sourceText: clipboardText,
          code: deckCode,
          name: inferredName || defaultName,
        });
      } catch {
        // Clipboard access can fail in browsers without permission; ignore silently.
      } finally {
        detecting = false;
      }
    };

    detectClipboardDeck();
    window.addEventListener('focus', detectClipboardDeck);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', detectClipboardDeck);
    };
  }, [activeMenu]);

  useEffect(() => {
    let disposed = false;
    const loadData = async () => {
      try {
        const loaded = await loadUserData();
        if (disposed) return;
        const loadedDecks = (loaded.kards_decks || INITIAL_DECKS) as Deck[];
        const loadedCollections = (loaded.kards_collections || []) as Collection[];
        const loadedCategories = (loaded.kards_custom_categories || []) as typeof customCategories;
        const loadedCustomTablecloths = (loaded.kards_custom_tablecloths || []) as string[];
        const loadedSelectedTablecloth = (loaded.kards_selected_tablecloth || DEFAULT_TABLECLOTH) as string;
        const loadedSettingsRaw = { ...((loaded.kards_settings || DEFAULT_SETTINGS) as any) };
        if (loadedSettingsRaw.isDarkMode !== undefined && loadedSettingsRaw.displayMode === undefined) {
          loadedSettingsRaw.displayMode = loadedSettingsRaw.isDarkMode ? 'dark' : 'light';
          delete loadedSettingsRaw.isDarkMode;
        }

        setDecks(loadedDecks);
        setCollections(loadedCollections);
        setCustomCategories(loadedCategories);
        setSelectedTablecloth(resolveSelectedTablecloth(loadedSelectedTablecloth, loadedCustomTablecloths));
        setCustomTablecloths(loadedCustomTablecloths);
        setSettings({ ...DEFAULT_SETTINGS, ...loadedSettingsRaw });
        setPackHistory((loaded.kards_pack_history_v1 || emptyPackHistory()) as PackHistory);
        setDataLoadError(null);
        setDataLoaded(true);
      } catch (e) {
        if (!disposed) setDataLoadError(e instanceof Error ? e.message : '读取本地数据失败');
      }
    };
    void loadData();
    return () => { disposed = true; };
  }, [loadAttempt]);

  useEffect(() => {
    if (!dataLoaded) return;
    void saveUserData('kards_decks', decks).catch(() => {});
  }, [decks, dataLoaded]);

  useEffect(() => {
    if (!dataLoaded) return;
    void saveUserData('kards_collections', collections).catch(() => {});
  }, [collections, dataLoaded]);

  useEffect(() => {
    if (!dataLoaded) return;
    void saveUserData('kards_custom_categories', customCategories).catch(() => {});
  }, [customCategories, dataLoaded]);

  const [effectiveIsDarkMode, setEffectiveIsDarkMode] = useState(true);

  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = new URL(effectiveIsDarkMode ? LOGOS.app.white : LOGOS.app.black, document.baseURI).href;
  }, [effectiveIsDarkMode]);

  useEffect(() => {
    if (!dataLoaded) return;
    void saveUserData('kards_settings', settings).catch(() => {});

    let isDark = true;
    if (settings.displayMode === 'system') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
      isDark = settings.displayMode === 'dark';
    }
    
    setEffectiveIsDarkMode(isDark);
    void window.kardsDesktop?.setTheme(settings.displayMode).catch(console.error);

    if (isDark) {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      
      // Clear inline variables to allow .dark CSS rules to apply
      const varsToRemove = [
        '--color-kards-bg', '--color-kards-panel', '--color-kards-panel-alt',
        '--color-kards-panel-hover', '--color-kards-input-bg', '--color-kards-modal-bg',
        '--color-kards-modal-overlay', '--bg-pattern', '--rgb-panel-overlay', '--rgb-panel-overlay-inv'
      ];
      varsToRemove.forEach(v => document.documentElement.style.removeProperty(v));
    } else {
      document.body.classList.remove('dark');
      document.body.classList.add('light');
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      
      // Apply custom light mode colors
      const lightVars = generateLightModeColors(settings.lightThemeColor || '#dcd7c9');
      Object.entries(lightVars).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value);
      });
    }

    // Apply border radius CSS variable
    document.documentElement.style.setProperty('--radius-base', `${settings.borderRadius}px`);
  }, [settings, dataLoaded]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (settings.displayMode === 'system') {
        const isDark = e.matches;
        setEffectiveIsDarkMode(isDark);
        if (isDark) {
          document.body.classList.add('dark');
          document.body.classList.remove('light');
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
          
          const varsToRemove = [
            '--color-kards-bg', '--color-kards-panel', '--color-kards-panel-alt',
            '--color-kards-panel-hover', '--color-kards-input-bg', '--color-kards-modal-bg',
            '--color-kards-modal-overlay', '--bg-pattern', '--rgb-panel-overlay', '--rgb-panel-overlay-inv'
          ];
          varsToRemove.forEach(v => document.documentElement.style.removeProperty(v));
        } else {
          document.body.classList.remove('dark');
          document.body.classList.add('light');
          document.documentElement.classList.remove('dark');
          document.documentElement.classList.add('light');
          
          const lightVars = generateLightModeColors(settings.lightThemeColor || '#dcd7c9');
          Object.entries(lightVars).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value);
          });
        }
      }
    };
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, [settings.displayMode, settings.lightThemeColor]);

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [movingCardInfo, setMovingCardInfo] = useState<{catId: string, backId: string} | null>(null);
  const [editingCardInfo, setEditingCardInfo] = useState<{catId: string, backId: string} | null>(null);
  const [editingCardName, setEditingCardName] = useState('');

  const [selectedTablecloth, setSelectedTablecloth] = useState<string>(DEFAULT_TABLECLOTH);

  const [customTablecloths, setCustomTablecloths] = useState<string[]>([]);

  const [showTableclothModal, setShowTableclothModal] = useState(false);
  const [tableclothUploadError, setTableclothUploadError] = useState<string | null>(null);
  const [showAddDeckToCollectionModal, setShowAddDeckToCollectionModal] = useState<string | null>(null);
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [collectionToDelete, setCollectionToDelete] = useState<Collection | null>(null);
  const [collectionToRename, setCollectionToRename] = useState<Collection | null>(null);
  const [renameCollectionName, setRenameCollectionName] = useState('');
  const [deckImageModal, setDeckImageModal] = useState<{show: boolean, deck: Pick<Deck, 'name' | 'code' | 'headquartersId' | 'cardBackUrl' | 'allyNation'> | null, loading: boolean, miniLoading: boolean, imageUrl: string | null, miniImageUrl: string | null, view: 'full' | 'mini', error: string | null, tablecloth: string}>({show: false, deck: null, loading: false, miniLoading: false, imageUrl: null, miniImageUrl: null, view: 'full', error: null, tablecloth: DEFAULT_TABLECLOTH});
  const [tableclothPickerForImage, setTableclothPickerForImage] = useState(false);
  const pageTableclothPicker = useRef<{ tablecloth: string; onChoose: (tablecloth: string) => void } | null>(null);
  const deckImageRequest = useRef(0);
  const closeDeckImage = () => { deckImageRequest.current++; setTableclothPickerForImage(false); setDeckImageModal(current => ({ ...current, show: false })); };

  const [cropQueue, setCropQueue] = useState<{ url: string, type: 'tablecloth' | 'cardback', category?: string, name?: string }[]>([]);
  const [cropState, setCropState] = useState<{ crop: { x: number, y: number }, zoom: number }>({ crop: { x: 0, y: 0 }, zoom: 1 });
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'tablecloth' | 'cardback', id: string, catId?: string } | null>(null);

  const getOrGenerateDeckImage = async (deck: Pick<Deck, 'name' | 'code' | 'headquartersId' | 'cardBackUrl' | 'allyNation'> & { mainNation?: string }, backgroundOverride?: string) => {
    const mainNation = deck.mainNation || decodeDeckCode(deck.code).mainNation;
    const headquarters = headquartersForDeck(deck.headquartersId, mainNation);
    const background = backgroundOverride || tableclothForHeadquarters(headquarters?.groupId) || selectedTablecloth;
    const limit = DEFAULT_DECK_RULES.standard.deckSize + 1;
    const cardBackUrl = cardBackForDeck({ ...deck, mainNation });
    const customBack = customCategories.flatMap(category => category.backs).find(back => back.url === cardBackUrl);
    const cardBackId = CARD_BACKS.find(back => back.file === cardBackUrl)?.id || (customBack ? `custom:${customBack.id}` : undefined);
    const imageData = await renderDeckImage(deck.code, cardDatabase, deck.name, background, deck.headquartersId, limit, cardBackId);
    await saveDeckImage(deck.code, imageData);
    return imageData;
  };

  const handleGetDeckImage = async (deck: Pick<Deck, 'name' | 'code' | 'headquartersId' | 'cardBackUrl' | 'allyNation'> & { mainNation?: string }) => {
    const request = ++deckImageRequest.current;
    const mainNation = deck.mainNation || decodeDeckCode(deck.code).mainNation;
    const background = tableclothForHeadquarters(headquartersForDeck(deck.headquartersId, mainNation)?.groupId) || selectedTablecloth;
    setDeckImageModal({ show: true, deck, loading: true, miniLoading: false, imageUrl: null, miniImageUrl: null, view: 'full', error: null, tablecloth: background });
    try {
      const imageData = await getOrGenerateDeckImage(deck, background);
      if (request !== deckImageRequest.current) return;
      setDeckImageModal(current => ({ ...current, show: true, deck, loading: false, miniImageUrl: null, view: 'full', imageUrl: imageData, error: null }));
    } catch (err: any) {
      if (request !== deckImageRequest.current) return;
      setDeckImageModal(current => ({ ...current, show: true, deck, loading: false, imageUrl: null, error: err.message }));
    }
  };

  const chooseTableclothForDeckImage = async (tablecloth: string) => {
    setShowTableclothModal(false);
    setTableclothPickerForImage(false);
    const deck = deckImageModal.deck;
    if (!deck) return;
    const request = ++deckImageRequest.current;
    setDeckImageModal(current => ({ ...current, loading: true, miniImageUrl: null, view: 'full', imageUrl: null, error: null, tablecloth }));
    try {
      const imageData = await getOrGenerateDeckImage(deck, tablecloth);
      if (request !== deckImageRequest.current) return;
      setDeckImageModal(current => ({ ...current, loading: false, miniImageUrl: null, view: 'full', imageUrl: imageData, tablecloth }));
    } catch (err: any) {
      if (request !== deckImageRequest.current) return;
      setDeckImageModal(current => ({ ...current, loading: false, imageUrl: null, error: err.message, tablecloth }));
    }
  };
  const generateMiniDeckImage = async () => {
    const deck = deckImageModal.deck; if (!deck || deckImageModal.miniLoading) return;
    if (deckImageModal.view === 'mini') { setDeckImageModal(current => ({ ...current, view: 'full' })); return; }
    if (deckImageModal.miniImageUrl) { setDeckImageModal(current => ({ ...current, view: 'mini' })); return; }
    const request = ++deckImageRequest.current;
    setDeckImageModal(current => ({ ...current, miniLoading: true }));
    try {
      const mainNation = decodeDeckCode(deck.code).mainNation;
      const cardBackUrl = cardBackForDeck({ ...deck, mainNation });
      const customBack = customCategories.flatMap(category => category.backs).find(back => back.url === cardBackUrl);
      const cardBackId = CARD_BACKS.find(back => back.file === cardBackUrl)?.id || (customBack ? `custom:${customBack.id}` : undefined);
      const mini = await renderDeckMiniImage(deck.code, cardDatabase, deck.name, deckImageModal.tablecloth, deck.headquartersId, cardBackUrl, cardBackId);
      if (request !== deckImageRequest.current) return;
      await saveDeckImage(deck.code, mini, 'mini');
      if (request !== deckImageRequest.current) return;
      setDeckImageModal(current => ({ ...current, miniLoading: false, miniImageUrl: mini, view: 'mini' }));
    } catch (error: any) {
      if (request !== deckImageRequest.current) return;
      setDeckImageModal(current => ({ ...current, miniLoading: false })); setErrorStatus(error.message || '无法生成迷你分享图');
    }
  };
  const openTableclothPicker = (forDeckImage = false, pagePicker: typeof pageTableclothPicker.current = null) => {
    pageTableclothPicker.current = pagePicker;
    setTableclothPickerForImage(forDeckImage);
    setShowTableclothModal(true);
  };
  const closeTableclothPicker = () => {
    pageTableclothPicker.current = null;
    setShowTableclothModal(false);
    setTableclothPickerForImage(false);
  };
  const chooseTablecloth = (tablecloth: string) => {
    if (pageTableclothPicker.current) {
      pageTableclothPicker.current.onChoose(tablecloth);
      closeTableclothPicker();
    }
    else if (tableclothPickerForImage) return chooseTableclothForDeckImage(tablecloth);
    else setSelectedTablecloth(tablecloth);
  };
  const activeTableclothChoice = pageTableclothPicker.current?.tablecloth || (tableclothPickerForImage ? deckImageModal.tablecloth : selectedTablecloth);

  const refreshAfterBackupImport = async () => {
    const loaded = await loadUserData();
    const loadedDecks = loaded.kards_decks as Deck[] | null;
    const loadedCollections = loaded.kards_collections as Collection[] | null;
    const loadedCategories = loaded.kards_custom_categories as typeof customCategories | null;
    const loadedSelectedTablecloth = loaded.kards_selected_tablecloth as string | null;
    const loadedCustomTablecloths = loaded.kards_custom_tablecloths as string[] | null;
    const loadedSettings = loaded.kards_settings as AppSettings | null;

    setDecks(loadedDecks || INITIAL_DECKS);
    setCollections(loadedCollections || []);
    setCustomCategories(loadedCategories || []);
    setCustomTablecloths(loadedCustomTablecloths || []);
    setSelectedTablecloth(resolveSelectedTablecloth(loadedSelectedTablecloth, loadedCustomTablecloths || []));
    setSettings({ ...DEFAULT_SETTINGS, ...(loadedSettings || {}) });
    setPackHistory((loaded.kards_pack_history_v1 || emptyPackHistory()) as PackHistory);
    setDataLoadError(null);
    setDataLoaded(true);
    setSelectedDeckId(null);
    setBuilderDeck(null);
    setBuilderRevision((revision) => revision + 1);
    setSettingsReturnMenu('decks');
    setActiveMenu(current => current === 'settings' ? current : 'decks');
  };

  const handleExportBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const backup = await createBackup();

      if (window.kardsDesktop?.saveBackup) {
        const result = await window.kardsDesktop.saveBackup(backup);
        setBackupStatus(result.canceled ? '已取消导出。' : `备份已导出：${result.filePath}`);
        return;
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kards-toolbox-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setBackupStatus('备份已导出。');
    } catch (err: any) {
      setBackupStatus(err.message || '导出失败。');
    } finally { setBackupBusy(false); }
  };

  const handleImportBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    let suspended = false;
    try {
      let content: string | undefined;

      if (window.kardsDesktop?.openBackup) {
        const result = await window.kardsDesktop.openBackup();
        if (result.canceled) {
          setBackupStatus('已取消导入。');
          return;
        }
        content = result.content;
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        content = await new Promise<string | undefined>((resolve) => {
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return resolve(undefined);
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(undefined);
            reader.readAsText(file);
          };
          input.oncancel = () => resolve(undefined);
          input.click();
        });
      }

      if (!content) return;

      const backup = parseBackup(content);
      await flushUserData();
      setDataLoaded(false); suspended = true;
      await restoreBackup(backup);
      await refreshAfterBackupImport();
      setBackupStatus('备份已导入，卡组、设置、构筑草稿和开包历史已恢复。');
    } catch (err: any) {
      setBackupStatus(err.message || '导入失败，请检查备份文件和本地存储空间。');
      if (suspended) setLoadAttempt(value => value + 1);
    } finally { setBackupBusy(false); }
  };

  const showAutomaticBackups = async () => {
    try {
      const backups = await readAutomaticBackups();
      if (!backups.length) { setBackupStatus('暂无自动备份。'); return; }
      setAutomaticBackupIndex(0); setAutomaticBackups(backups);
    } catch (error) { setBackupStatus(error instanceof Error ? error.message : '读取自动备份失败'); }
  };

  const restoreAutomaticBackup = async () => {
    const backup = automaticBackups?.[automaticBackupIndex];
    if (!backup || backupBusy) return;
    setAutomaticBackups(null); setBackupBusy(true);
    let suspended = false;
    try {
      await flushUserData();
      setDataLoaded(false); suspended = true;
      await restoreBackup({ app: 'kards-toolbox', schemaVersion: 1, exportedAt: backup.createdAt, data: backup.data });
      await refreshAfterBackupImport();
      setBackupStatus('已恢复自动备份。');
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : '恢复自动备份失败');
      if (suspended) setLoadAttempt(value => value + 1);
    } finally { setBackupBusy(false); }
  };

  const recordOpenedPack = async (kind: CardPackKind, rewards: PackReward[]) => {
    const next = await updateUserData<PackHistory>('kards_pack_history_v1', current => addPackHistory(current || emptyPackHistory(), kind, rewards));
    setPackHistory(next);
  };

  useEffect(() => {
    if (!dataLoaded) return;
    void saveUserData('kards_selected_tablecloth', selectedTablecloth || DEFAULT_TABLECLOTH).catch(() => {});
  }, [selectedTablecloth, dataLoaded]);

  useEffect(() => {
    if (!dataLoaded) return;
    void saveUserData('kards_custom_tablecloths', customTablecloths).catch(() => {});
  }, [customTablecloths, dataLoaded]);

  const handleTableclothUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setTableclothUploadError('仅支持 JPG, PNG, WEBP 格式');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setCropQueue(prev => [...prev, { url: result, type: 'tablecloth' }]);
      // setCustomTablecloths(prev => [...prev, result]);
      // setSelectedTablecloth(result);
      setTableclothUploadError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const allCategories = React.useMemo<AvailableCardBackCategory[]>(() => {
    const targetDeck = decks.find(deck => deck.id === showCardBackModal);
    const merged: AvailableCardBackCategory[] = CARD_BACK_CATEGORIES.filter(category => category.backs.some(back => !targetDeck || cardBackIsAvailable(back, targetDeck.mainNation, targetDeck.allyNation))).map(c => ({
      id: c.id,
      name: c.name,
      isCustom: false,
      backs: c.backs.map(b => ({ ...b, url: b.file, isCustomCard: false }))
    }));

    customCategories.forEach(cc => {
      const existing = merged.find(m => m.id === cc.id);
      if (existing) {
        existing.backs.push(...cc.backs.map(b => ({ ...b, isCustomCard: true })));
      } else {
        merged.push({
          id: cc.id,
          name: cc.name,
          isCustom: true,
          backs: cc.backs.map(b => ({ ...b, isCustomCard: true }))
        });
      }
    });

    return merged;
  }, [customCategories, decks, showCardBackModal]);

  const activeDeckId = selectedDeckId || hoveredDeckId;
  const headquartersModalDeck = decks.find(deck => deck.id === showHeadquartersModal);
  const selectedDeck = decks.find(d => d.id === activeDeckId);
  const deckInFocus = activeMenu === 'builder' ? builderDeck : activeMenu === 'decks' ? selectedDeck : null;
  const focusedNation = deckInFocus
    ? ('mainNation' in deckInFocus && typeof deckInFocus.mainNation === 'string' ? deckInFocus.mainNation : decodeDeckCode(deckInFocus.code).mainNation)
    : undefined;
  const focusedHeadquartersId = typeof deckInFocus?.headquartersId === 'string' ? deckInFocus.headquartersId : undefined;
  const focusedHeadquarters = focusedNation ? headquartersForDeck(focusedHeadquartersId, focusedNation) : undefined;
  const activeTablecloth = (focusedHeadquarters ? tableclothForHeadquarters(focusedHeadquarters.groupId) : undefined) || selectedTablecloth;
  const reservedDeckIds = React.useMemo(() => {
    const reservedIds = new Set(cardDatabase.filter(card => card.reserved).map(card => card.importId));
    return new Set(decks.filter(deck => {
      try { return [...decodeDeckCode(deck.code).counts.keys()].some(id => reservedIds.has(id)); }
      catch { return false; }
    }).map(deck => deck.id));
  }, [decks, cardDatabase]);
  const previewEntries = React.useMemo(() => {
    if (!selectedDeck) return [];
    const index = findCardsByImportId(cardDatabase);
    try { return [...decodeDeckCode(selectedDeck.code).counts].sort(([a], [b]) => (index.get(a)?.json.kredits ?? 99) - (index.get(b)?.json.kredits ?? 99))
      .map(([id, count]) => ({ id, count, card: index.get(id) })); }
    catch { return []; }
  }, [selectedDeck?.code, cardDatabase]);
  const previewCosts = React.useMemo(() => ({
    entries: new Map(previewEntries.map(entry => [entry.id, entry.count])),
    cardsById: new Map(previewEntries.flatMap(entry => entry.card ? [[entry.id, entry.card] as const] : [])),
  }), [previewEntries]);
  const previewTotalCards = previewEntries.reduce((sum, entry) => sum + entry.count, 1);
  const previewHeadquarters = selectedDeck && headquartersForDeck(selectedDeck.headquartersId, selectedDeck.mainNation);
  const previewDetailSequence: CardDetailItem[] = [
    ...(previewHeadquarters ? [{ headquarters: previewHeadquarters }] : []),
    ...previewEntries.flatMap(entry => entry.card ? [{ card: entry.card }] : []),
  ];
  const previewAllyCount = selectedDeck?.mainNation === selectedDeck?.allyNation ? 0 : previewEntries.reduce((sum, entry) => sum + (entry.card?.json.faction?.toLowerCase() === selectedDeck?.allyNation?.toLowerCase() ? entry.count : 0), 0);
  const previewMainCount = 1 + previewEntries.reduce((sum, entry) => sum + (entry.card?.json.faction?.toLowerCase() === selectedDeck?.mainNation.toLowerCase() ? entry.count : 0), 0);
  const previewDeckLimit = DEFAULT_DECK_RULES.standard.deckSize + 1;
  const previewAllyLimit = DEFAULT_DECK_RULES.standard.maxAllyCards;

  const handleCloseImportModal = () => {
    cancelImageImport.current?.();
    setShowImportModal(false);
    setImportCode('');
    setImportName('');
    setImportHeadquartersId(undefined);
    setImportCardBackId(undefined);
    setImportImageBusy(false);
    setErrorStatus(null);
  };

  const handleDismissClipboardDeck = () => {
    setClipboardDeckCandidate(null);
  };

  const handleImportClipboardDeck = () => {
    if (!clipboardDeckCandidate) return;

    setImportCode(clipboardDeckCandidate.sourceText);
    setImportHeadquartersId(undefined);
    setImportCardBackId(undefined);
    setImportName(currentName => currentName || clipboardDeckCandidate.name);
    setErrorStatus(null);
    setShowImportModal(true);
    setClipboardDeckCandidate(null);
  };

  const addDeckFromCode = (sourceText: string, name: string, headquartersId?: string, cardBackId?: string) => {
      const deckCode = extractDeckCodeFromText(sourceText);
      const inferredName = inferDeckTitleFromText(sourceText, deckCode);
      const { mainNation, allyNation, totalCards, defaultName } = parseDeck(deckCode);
      const entries = decodeDeckCode(deckCode).counts, index = findCardsByImportId(cardDatabase);
      const ruleSet = deckRuleSet(entries, index);
      const catalogBack = CARD_BACKS.find(back => back.id === cardBackId && cardBackIsAvailable(back, mainNation, allyNation));
      const customBack = cardBackId?.startsWith('custom:') ? customCategories.flatMap(category => category.backs).find(back => back.id === cardBackId.slice(7)) : undefined;
      
      const newDeck: Deck = {
        id: crypto.randomUUID(),
        name: name.trim() || inferredName || defaultName,
        mainNation,
        allyNation,
        code: deckCode,
        headquartersId: headquartersOptions(mainNation).some(item => item.groupId === headquartersId) ? headquartersId : undefined,
        cardBackUrl: catalogBack?.file || customBack?.url,
        cardBackScope: catalogBack?.scope,
        cardBackNation: catalogBack?.nation,
        isFavorite: false,
        totalCards,
        warnings: validateDeck(entries, index, mainNation, allyNation, DEFAULT_DECK_RULES[ruleSet]),
        ruleSet, isArena: ruleSet === 'arena'
      };
      
      setDecks(current => [...current, newDeck]);
      setSelectedDeckId(newDeck.id);
      setImportCode('');
      setImportName('');
      setImportHeadquartersId(undefined);
      setImportCardBackId(undefined);
      setShowImportModal(false);
      setShowNewDeckModal(false);
      setErrorStatus(null);
      
      // Reset filters so the newly added deck is visible
      setSearchQuery('');
      setFilterMainNation('All');
      setFilterAllyNation('All');
      setFilterTag('All');
  };

  const handleAddDeck = () => {
    if (!importCode.trim() || importImageBusy) return;
    try {
      addDeckFromCode(importCode, importName, importHeadquartersId, importCardBackId);
    } catch (e: any) {
      setErrorStatus(ERROR_LOCALE[e.message] || e.message || '格式错误');
    }
  };

  const handleSaveBuiltDeck = async (built: BuilderDeck, warnings: string[]) => {
    const parsed = parseDeck(built.code);
    const existing = decks.find((deck) => deck.id === built.id);
    const savedDeck: Deck = {
      ...existing,
      id: existing?.id || crypto.randomUUID(),
      name: built.name, mainNation: parsed.mainNation, allyNation: parsed.allyNation,
      code: built.code, isFavorite: existing?.isFavorite || false,
      totalCards: parsed.totalCards, warnings, isArena: built.ruleSet === 'arena',
      ruleSet: built.ruleSet, headquartersId: built.headquartersId,
    };
    const nextDecks = existing ? decks.map((deck) => deck.id === existing.id ? savedDeck : deck) : [...decks, savedDeck];
    await saveUserData('kards_decks', nextDecks, { rememberFailure: false });
    setDecks(nextDecks);
    setSelectedDeckId(savedDeck.id); setBuilderDeck(null); setActiveMenu('decks');
    setSearchQuery(''); setFilterMainNation('All'); setFilterAllyNation('All'); setFilterTag('All');
  };

  const handleDeleteDeck = (id: string) => {
    setDecks(decks.filter(d => d.id !== id));
    setCollections(current => current.map(folder => ({ ...folder, deckIds: folder.deckIds.filter(deckId => deckId !== id) })));
    if (selectedDeckId === id) setSelectedDeckId(null);
    if (hoveredDeckId === id) setHoveredDeckId(null);
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      alert('卡组码已复制！');
    } catch {
      window.prompt('剪贴板不可用，请手动复制卡组码：', code);
    }
  };

  const toggleFavorite = (id: string) => {
    setDecks(decks.map(d => d.id === id ? { ...d, isFavorite: !d.isFavorite } : d));
  };

  const handleNameChange = (id: string, newName: string) => {
    setDecks(decks.map(d => d.id === id ? { ...d, name: newName } : d));
  };

  const handleMultiFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from<File>(e.target.files as unknown as Iterable<File> || []);
    if (!files.length) return;

    if (!uploadCategory) {
      setUploadError('请先选择一个分类');
      return;
    }

    const validFiles = files.filter(f => f.type.startsWith('image/'));
    if (validFiles.length !== files.length) {
      setUploadError(`跳过了 ${files.length - validFiles.length} 个格式有误的文件`);
    } else {
      setUploadError(null);
    }
    
    if (validFiles.length === 0) return;

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setCropQueue(prev => [...prev, { url: result, type: 'cardback', category: uploadCategory, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    
    setShowUploadModal(false);
    e.target.value = ''; // Reset input
  };

  const handleCropComplete = React.useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleNextCrop = async () => {
    if (cropQueue.length === 0) return;
    const currentCrop = cropQueue[0];
    
    try {
      const croppedImage = await getCroppedImg(
        currentCrop.url,
        croppedAreaPixels
      );

      if (currentCrop.type === 'tablecloth') {
        setCustomTablecloths(prev => [...prev, croppedImage]);
        if (tableclothPickerForImage) await chooseTablecloth(croppedImage);
        else setSelectedTablecloth(croppedImage);
      } else if (currentCrop.type === 'cardback' && currentCrop.category) {
        setCustomCategories(prev => {
          const newCatId = currentCrop.category!;
          const catExists = prev.some(c => c.id === newCatId);
          if (catExists) {
             return prev.map(c => 
               c.id === newCatId ? { ...c, backs: [...c.backs, { id: Date.now().toString() + Math.random(), url: croppedImage, name: currentCrop.name || 'Custom', isCustomCard: true }] } : c
             );
          } else {
             const builtIn = CARD_BACK_CATEGORIES.find(c => c.name === newCatId);
             return [...prev, { id: newCatId, name: builtIn ? builtIn.name : newCatId, backs: [{ id: Date.now().toString() + Math.random(), url: croppedImage, name: currentCrop.name || 'Custom', isCustomCard: true }] }];
          }
        });
      }
    } catch (e) {
      console.error(e);
    }

    setCropQueue(prev => prev.slice(1));
    setCropState({ crop: { x: 0, y: 0 }, zoom: 1 });
  };

  const handleCancelCrop = () => {
    setCropQueue(prev => prev.slice(1));
    setCropState({ crop: { x: 0, y: 0 }, zoom: 1 });
  };

  const allTags = React.useMemo(() => {
    const tags = new Set<string>();
    decks.forEach(d => {
      if (d.tags) d.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [decks]);

  let filteredDecks = [...decks];
  if (searchQuery) {
    filteredDecks = filteredDecks.filter(d => 
      d.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }
  if (filterMainNation !== 'All') {
    filteredDecks = filteredDecks.filter(d => d.mainNation === filterMainNation);
  }
  if (filterAllyNation !== 'All') {
    filteredDecks = filteredDecks.filter(d => d.allyNation === filterAllyNation);
  }
  if (filterTag !== 'All') {
    filteredDecks = filteredDecks.filter(d => d.tags && d.tags.includes(filterTag));
  }

  // Sort: favorites first
  const sortedDecks = filteredDecks.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));

  useEffect(() => {
    if (!dataLoaded || !cardDatabase.length) return;
    const cardsById = findCardsByImportId(cardDatabase);
    setDecks(current => current.map(deck => {
      try {
        const entries = decodeDeckCode(deck.code).counts;
        const ruleSet = deckRuleSet(entries, cardsById);
        const warnings = validateDeck(entries, cardsById, deck.mainNation, deck.allyNation, DEFAULT_DECK_RULES[ruleSet]);
        return JSON.stringify(warnings) === JSON.stringify(deck.warnings) && deck.ruleSet === ruleSet && deck.isArena === (ruleSet === 'arena')
          ? deck : { ...deck, warnings, ruleSet, isArena: ruleSet === 'arena' };
      } catch { return deck; }
    }));
  }, [cardDatabase, dataLoaded]);

  const closeSettings = () => {
    setActiveMenu(settingsReturnMenu);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[aria-label="应用工具"] button:last-child')?.focus());
  };

  const openDeckEditor = (deck: Deck) => {
    setBuilderDeck({ ...deck });
    setBuilderRevision(revision => revision + 1);
    setActiveMenu('builder');
  };

  const settingsPage = <section ref={settingsPageRef} tabIndex={-1} onKeyDown={event => {
    if (event.nativeEvent.isComposing || event.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    if (event.key === 'Escape') { event.preventDefault(); closeSettings(); }
  }} aria-label="应用设置" data-testid="settings-page" className="w-full p-5 outline-none md:p-8">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <h2 className="text-2xl font-bold text-kards-text">设置</h2>
    </div>
    <CardDataUpdater cards={cardDatabase} onApplied={cards => { setCardDatabase(cards); setCardDatabaseError(null); }} />
    <CardCacheManager cards={cardDatabase} />
    <section className="glass-panel rounded-lg p-5 md:p-6">
      <h3 className="mb-6 text-lg font-bold text-kards-text">外观与本地数据</h3>
      <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2">
                {/* Light Theme Color Picker (Only show if not dark) */}
                {(!effectiveIsDarkMode) && (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-kards-text tracking-wider">浅色主题色</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSettings(s => ({ ...s, lightThemeColor: '#dcd7c9' }))}
                        className="text-[10px] uppercase tracking-wider text-kards-text-muted hover:text-kards-text border border-kards-border px-2 py-1 rounded"
                      >
                        重置
                      </button>
                      <input
                        type="color"
                        value={settings.lightThemeColor || '#dcd7c9'}
                        onChange={(e) => setSettings(s => ({ ...s, lightThemeColor: e.target.value }))}
                        className="w-10 h-8 p-0 border-0 bg-transparent cursor-pointer rounded overflow-hidden shadow-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Border Radius */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-kards-text tracking-wider">圆角程度</span>
                    <span className="text-xs font-mono text-kards-gold">{settings.borderRadius}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="1"
                    value={settings.borderRadius ?? DEFAULT_SETTINGS.borderRadius}
                    onChange={e => setSettings(s => ({ ...s, borderRadius: parseInt(e.target.value) }))}
                    className="w-full accent-kards-gold h-1.5 bg-kards-panel-alt rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-kards-text-muted font-bold uppercase tracking-widest">
                    <span>直角</span>
                    <span>圆角</span>
                  </div>
                </div>

                {/* Import Box Opacity */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-kards-text tracking-wider">UI组件透明度</span>
                    <span className="text-xs font-mono text-kards-gold">{Math.round(settings.importBoxOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.importBoxOpacity ?? DEFAULT_SETTINGS.importBoxOpacity}
                    onChange={e => setSettings(s => ({ ...s, importBoxOpacity: parseFloat(e.target.value) }))}
                    className="w-full accent-kards-gold h-1.5 bg-kards-panel-alt rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* UI Scale */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-kards-text tracking-wider">UI组件大小</span>
                    <span className="text-xs font-mono text-kards-gold">{Math.round(settings.uiScale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.05"
                    value={settings.uiScale ?? DEFAULT_SETTINGS.uiScale}
                    onChange={e => setSettings(s => ({ ...s, uiScale: parseFloat(e.target.value) }))}
                    className="w-full accent-kards-gold h-1.5 bg-kards-panel-alt rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-kards-text-muted font-bold uppercase tracking-widest">
                    <span>精致</span>
                    <span>巨大</span>
                  </div>
                </div>

                {/* Deck Gap */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-kards-text tracking-wider">卡组间距</span>
                    <span className="text-xs font-mono text-kards-gold">{settings.deckGap}rem</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="4"
                    step="0.1"
                    value={settings.deckGap ?? DEFAULT_SETTINGS.deckGap}
                    onChange={e => setSettings(s => ({ ...s, deckGap: parseFloat(e.target.value) }))}
                    className="w-full accent-kards-gold h-1.5 bg-kards-panel-alt rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-kards-text-muted font-bold uppercase tracking-widest">
                    <span>紧凑</span>
                    <span>宽松</span>
                  </div>
                </div>

                {/* Logo Size */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-kards-text tracking-wider">背景Logo大小</span>
                    <span className="text-xs font-mono text-kards-gold">{settings.logoSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="200"
                    max="800"
                    step="10"
                    value={settings.logoSize ?? DEFAULT_SETTINGS.logoSize}
                    onChange={e => setSettings(s => ({ ...s, logoSize: parseInt(e.target.value) }))}
                    className="w-full accent-kards-gold h-1.5 bg-kards-panel-alt rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Logo Opacity */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-kards-text tracking-wider">背景Logo透明度</span>
                    <span className="text-xs font-mono text-kards-gold">{Math.round(settings.logoOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.logoOpacity ?? DEFAULT_SETTINGS.logoOpacity}
                    onChange={e => setSettings(s => ({ ...s, logoOpacity: parseFloat(e.target.value) }))}
                    className="w-full accent-kards-gold h-1.5 bg-kards-panel-alt rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="space-y-3 pt-2 border-t border-kards-border">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-bold text-kards-text tracking-wider">数据备份</span>
                    <button type="button" onClick={() => { resetUsageTips(); setBackupStatus('已恢复所有使用 Tips'); }} className="rounded border border-kards-border px-2 py-1 text-xs text-kards-text-muted hover:border-kards-gold hover:text-kards-text">重新显示所有使用Tips</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleExportBackup}
                      disabled={backupBusy}
                      className="bg-kards-panel border border-kards-border text-kards-text text-xs font-bold tracking-widest py-2 hover:border-kards-gold hover:text-kards-gold transition-colors"
                    >
                      导出备份
                    </button>
                    <button
                      onClick={handleImportBackup}
                      disabled={backupBusy}
                      className="bg-kards-panel border border-kards-border text-kards-text text-xs font-bold tracking-widest py-2 hover:border-kards-gold hover:text-kards-gold transition-colors"
                    >
                      导入备份
                    </button>
                  </div>
                  <button type="button" disabled={backupBusy} onClick={() => { void showAutomaticBackups(); }} className="w-full rounded border border-kards-border py-2 text-xs text-kards-text-muted hover:border-kards-gold hover:text-kards-text disabled:opacity-50">恢复自动备份</button>
                  {backupStatus && (
                    <p className="text-[11px] text-kards-text-muted break-all">{backupStatus}</p>
                  )}
                </div>

      </div>
      <div className="mt-6 border-t border-kards-border pt-4">
        <button onClick={() => setSettings(DEFAULT_SETTINGS)} className="rounded border border-kards-border px-4 py-2 text-sm text-kards-text hover:border-kards-gold">重置外观默认值</button>
      </div>
    </section>
  </section>;

  const automaticBackupDialog = automaticBackups && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-kards-modal-overlay p-5 backdrop-blur-sm" onClick={() => setAutomaticBackups(null)}>
    <section role="dialog" aria-modal="true" aria-label="恢复自动备份" tabIndex={-1} onKeyDown={handleDialogKeys} onClick={event => event.stopPropagation()} className="glass-panel w-full max-w-md rounded-lg p-6 text-kards-text">
      <h2 className="text-center text-lg font-bold">恢复自动备份？</h2>
      <div role="group" aria-label="选择自动备份" className="my-5 flex flex-col gap-2">{automaticBackups.map((backup, index) => <button key={`${backup.createdAt}-${index}`} type="button" aria-pressed={automaticBackupIndex === index} onClick={() => setAutomaticBackupIndex(index)} className={`rounded border px-4 py-3 text-left text-sm hover:border-kards-gold ${automaticBackupIndex === index ? 'border-kards-gold text-kards-status' : 'border-kards-border'}`}>{new Date(backup.createdAt).toLocaleString()}</button>)}</div>
      <div className="flex justify-center gap-3"><button type="button" data-dialog-cancel onClick={() => setAutomaticBackups(null)} className="rounded border border-kards-border px-5 py-2 hover:border-kards-gold">取消</button><button type="button" data-dialog-confirm onClick={() => { void restoreAutomaticBackup(); }} className="rounded bg-kards-accent px-5 py-2 text-white hover:brightness-110">恢复</button></div>
    </section>
  </div>;

  if (!dataLoaded) return <main className="flex h-screen flex-col items-center justify-center gap-5 bg-kards-bg p-8 text-kards-text" aria-busy={!dataLoadError}>
    <h1 className="text-xl font-bold">{dataLoadError ? '本地数据读取失败' : '正在读取本地数据…'}</h1>
    {dataLoadError && <><p role="alert" className="max-w-lg text-center text-sm text-kards-text-muted">{dataLoadError}。已停止自动保存，原数据不会被默认值覆盖。</p><div className="flex flex-wrap justify-center gap-3"><button type="button" onClick={() => { setDataLoadError(null); setLoadAttempt(value => value + 1); }} className="rounded bg-kards-accent px-4 py-2 text-white hover:brightness-110">重试读取</button><button type="button" disabled={backupBusy} onClick={handleExportBackup} className="rounded border border-kards-border px-4 py-2 hover:border-kards-gold">导出备份</button><button type="button" disabled={backupBusy} onClick={handleImportBackup} className="rounded border border-kards-border px-4 py-2 hover:border-kards-gold">导入备份</button><button type="button" disabled={backupBusy} onClick={() => { void showAutomaticBackups(); }} className="rounded border border-kards-border px-4 py-2 hover:border-kards-gold">恢复自动备份</button></div></>}
    {backupStatus && <p role="status" className="max-w-lg text-center text-sm text-kards-text-muted">{backupStatus}</p>}
    {automaticBackupDialog}
  </main>;

  return (
    <div className="flex flex-col h-screen military-noise relative">
      <UserDataSaveStatus />
      {automaticBackupDialog}
      {/* --- Top Bar --- */}
      <header className="h-14 bg-kards-gray flex items-center justify-between px-6 border-b border-kards-border z-20 transition-colors duration-300">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <img 
              src={effectiveIsDarkMode ? LOGOS.brand.white : LOGOS.brand.black}
              alt="KARDS Logo" 
              className="h-16 w-auto transition-opacity"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <span className="text-xl font-bold tracking-widest text-kards-text sr-only">KARDS Toolbox · KARDS 工具箱</span>
          </div>
          <nav className="flex items-center gap-6">
            <h1 className="text-kards-text font-bold border-l border-kards-border pl-6 cursor-default tracking-widest">
              {activeMenu === 'cards' ? '卡牌' : activeMenu === 'packs' ? '卡包' : activeMenu === 'deck-image' ? '卡组生图' : activeMenu === 'builder' ? '卡组构筑' : activeMenu === 'about' ? '关于' : activeMenu === 'settings' ? '设置' : '卡组'}
            </h1>
            <div className="flex items-center gap-3">
              {activeMenu === 'decks' && <>
              <div className="relative"><input
                type="text" 
                aria-label="搜索卡组"
                placeholder="搜索卡组..."
                value={searchQuery || ''}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-kards-gray-alt border border-kards-border text-kards-text text-sm pl-3 pr-9 py-1.5 focus:outline-none focus:border-kards-gold min-w-[200px] rounded transition-colors"
              /><SearchClearButton label="清除卡组搜索" value={searchQuery || ''} onClear={() => setSearchQuery('')} /></div>
              <button type="button" aria-pressed={settings.showDeckFolders} onClick={() => setSettings(current => ({ ...current, showDeckFolders: !current.showDeckFolders }))} className="builder-reserved-toggle">显示收藏夹</button>
                <>
                  <CustomSelect label="卡组主国筛选" value={filterMainNation || 'All'} onChange={value => setFilterMainNation(value as Nation | 'All')} options={[{ value: 'All', label: '主国：全部' }, ...nationOptions().filter(option => NATION_DATA[option.value as Nation]?.isMainAllowed)]} />
                  <CustomSelect label="卡组盟国筛选" value={filterAllyNation || 'All'} onChange={value => setFilterAllyNation(value as Nation | 'All')} options={[{ value: 'All', label: '盟国：全部' }, ...nationOptions().filter(option => option.value !== 'Neutral')]} />
                  <CustomSelect label="卡组标签筛选" value={filterTag || 'All'} onChange={setFilterTag} className="max-w-[180px]" options={[{ value: 'All', label: '标签：全部' }, ...allTags.map(tag => ({ value: tag, label: tag }))]} />
                </>
              </>}
            </div>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSettings(current => ({ ...current, displayMode: effectiveIsDarkMode ? 'light' : 'dark' }))}
            disabled={!dataLoaded} aria-label={effectiveIsDarkMode ? '切换到浅色模式' : '切换到深色模式'} title={effectiveIsDarkMode ? '切换到浅色模式' : '切换到深色模式'} className="p-2 text-kards-text-muted hover:bg-kards-panel-hover hover:text-kards-text transition-colors disabled:opacity-40">
            {effectiveIsDarkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
          <button onClick={() => {
            if (activeMenu === 'builder') {
              builderExitRequest.current?.(() => { setAboutReturnMenu('decks'); setActiveMenu('about'); });
              return;
            }
            if (activeMenu !== 'about') setAboutReturnMenu(activeMenu);
            setActiveMenu('about');
          }} aria-label="关于" title="关于 KARDS Toolbox" className="p-2 hover:bg-kards-panel-hover transition-colors group">
            <Info className="w-5 h-5 text-kards-text-muted group-hover:text-kards-text" />
          </button>

        </div>
      </header>

      {/* --- Main Layout --- */}
      <div data-testid="workspace" className="relative flex min-h-0 flex-1 overflow-hidden">
        <TableclothBackground source={activeTablecloth} />
        
        {/* Left Sidebar */}
        {activeMenu !== 'builder' && <aside aria-label="主导航" className="glass-panel w-[72px] shrink-0 flex flex-col gap-1 p-1 z-10 border-r border-kards-border transition-colors duration-300">
          <SidebarButton active={activeMenu === 'decks'} onClick={() => setActiveMenu('decks')} icon={<Library className="w-8 h-8" />} label="卡组" />
          <SidebarButton active={activeMenu === 'cards'} onClick={() => setActiveMenu('cards')} icon={<img src={effectiveIsDarkMode ? LOGOS.cards.beige : LOGOS.cards.black} alt="" className="h-8 w-8 object-contain" />} label="卡牌" />
          <SidebarButton active={activeMenu === 'packs'} onClick={() => setActiveMenu('packs')} icon={<img src={LOGOS.pack} alt="" className="pack-navigation-icon h-8 w-8 object-contain" />} label="卡包" />
          <div aria-label="应用工具" className="mt-auto flex flex-col gap-1 border-t border-kards-border pt-1">
            <SidebarButton active={activeMenu === 'deck-image'} onClick={() => { setClipboardDeckCandidate(null); setActiveMenu('deck-image'); }} icon={<ImageIcon className="w-6 h-6" />} label="卡组生图" />
            <SidebarButton active={showTableclothModal} onClick={() => openTableclothPicker()} icon={<Palette className="w-6 h-6" />} label="桌布" />
            <SidebarButton active={activeMenu === 'settings'} onClick={() => { if (activeMenu !== 'settings') setSettingsReturnMenu(activeMenu); setActiveMenu('settings'); }} icon={<Settings className="w-6 h-6" />} label="设置" />
          </div>
        </aside>}

        {/* Center Grid */}
        <main className="min-w-0 flex-1 overflow-hidden relative transition-colors duration-300">
          {/* Nation Background Overlay - Fixed to viewport */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none z-0">
            <div className="absolute inset-0 bg-black/20" />
            <AnimatePresence>
              {selectedDeck && activeMenu === 'decks' && (
                <motion.div 
                  key={selectedDeck.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  {selectedDeck.allyNation && selectedDeck.allyNation !== selectedDeck.mainNation ? (
                    <div className="flex items-center justify-center gap-32 w-full">
                      <div className="flex-1 flex justify-end">
                        <img 
                          src={NATION_DATA[selectedDeck.mainNation].icon} 
                          style={{ width: settings.logoSize, height: settings.logoSize, opacity: settings.logoOpacity * (activeTablecloth ? 1.2 : 0.8) }}
                          className="object-contain transition-all duration-300" 
                          alt="main"
                        />
                      </div>
                      <div className="flex-1 flex justify-start">
                        <img 
                          src={NATION_DATA[selectedDeck.allyNation].icon} 
                          style={{ width: settings.logoSize * 0.77, height: settings.logoSize * 0.77, opacity: settings.logoOpacity * (activeTablecloth ? 1 : 0.6) }}
                          className="object-contain transition-all duration-300" 
                          alt="ally"
                        />
                      </div>
                    </div>
                  ) : (
                    <img 
                      src={NATION_DATA[selectedDeck.mainNation].icon} 
                      style={{ width: settings.logoSize * 1.1, height: settings.logoSize * 1.1, opacity: settings.logoOpacity * (activeTablecloth ? 1.2 : 0.8) }}
                      className="object-contain transition-all duration-300" 
                      alt="nation"
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Scrollable Content Container */}
          <div ref={deckGrid.ref} className={`h-full w-full ${activeMenu === 'packs' || activeMenu === 'deck-image' ? 'overflow-hidden' : 'overflow-y-auto'} no-scrollbar relative z-10 flex flex-col items-center ${activeMenu === 'cards' || activeMenu === 'packs' || activeMenu === 'builder' || activeMenu === 'settings' || activeMenu === 'deck-image' ? '' : 'p-12'}`}>
            {activeMenu === 'deck-image' && (cardDatabaseLoading ? <p className="py-20 text-kards-text-muted">正在读取本地卡牌目录…</p>
              : cardDatabaseError ? <p role="alert" className="p-6 text-red-400">{cardDatabaseError}</p>
                : <DeckImagePage cards={cardDatabase} decks={decks} tablecloth={selectedTablecloth} customCategories={customCategories}
                  onOpenTableclothPicker={(tablecloth, onChoose) => openTableclothPicker(true, { tablecloth, onChoose })} />)}
            {activeMenu === 'cards' && (
              cardDatabaseLoading ? <div className="py-20 text-kards-text-muted">正在读取本地卡牌目录…</div>
                : cardDatabaseError ? <div className="max-w-xl rounded border border-red-500/40 bg-red-500/10 p-6 text-red-300">{cardDatabaseError}</div>
                  : <div className="h-full w-full max-w-[1800px]"><CardLibrary cards={cardDatabase} detailMode={settings.cardDetailMode} onDetailModeChange={cardDetailMode => setSettings(current => ({ ...current, cardDetailMode }))} /></div>
            )}
            {activeMenu === 'builder' && cardDatabaseLoading && <p className="py-20 text-kards-text-muted">正在读取本地卡牌目录…</p>}
            {activeMenu === 'packs' && (cardDatabaseLoading ? <p className="py-20 text-kards-text-muted">正在读取本地卡牌目录…</p>
              : cardDatabaseError ? <p role="alert" className="p-6 text-red-400">{cardDatabaseError}</p>
                : <CardPacks cards={cardDatabase} history={packHistory} onOpenPack={recordOpenedPack} />)}
            {activeMenu === 'builder' && cardDatabaseError && <p className="p-6 text-red-400">{cardDatabaseError}</p>}
            {!cardDatabaseLoading && !cardDatabaseError && builderDeck && <div className={`h-full w-full max-w-[1800px] shrink-0 ${activeMenu === 'builder' ? '' : 'hidden'}`}><DeckBuilder active={activeMenu === 'builder'} key={builderRevision} cards={cardDatabase} initialDeck={builderDeck} exitRequestRef={builderExitRequest} onSave={handleSaveBuiltDeck} onBack={() => { setBuilderDeck(null); setActiveMenu('decks'); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[aria-label="主导航"] button')?.focus()); }} /></div>}
            {activeMenu === 'settings' && settingsPage}
            {activeMenu === 'about' && <AboutPage isDarkMode={effectiveIsDarkMode} onBack={() => setActiveMenu(aboutReturnMenu)} />}
            {activeMenu === 'decks' && settings.showDeckFolders && <div className="mb-6 flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
              <button onClick={() => setShowNewDeckModal(true)} className="flex items-center gap-2 rounded bg-kards-accent px-3 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4" />新卡组</button>
            </div>}
            {activeMenu === 'decks' && !settings.showDeckFolders && (
              <div data-testid="deck-grid"
                style={deckGrid.style}
                className="max-w-7xl w-full shrink-0 relative"
              >
                {sortedDecks.map((deck) => (
                  <DeckCard 
                    key={deck.id}
                    deck={deck}
                    selected={activeDeckId === deck.id}
                    onClick={() => selectDeck(deck.id)}
                    onHover={() => hoverDeck(deck.id)}
                    onHoverLeave={scheduleDeckHoverClose}
                    onDoubleClick={() => openDeckEditor(deck)}
                    settings={settings}
                    hasReserved={reservedDeckIds.has(deck.id)}
                  />
                ))}

                {/* Add Deck Placeholder */}
                <button 
                  onClick={() => setShowNewDeckModal(true)}
                  className="flex min-w-0 flex-col items-center group flex-shrink-0"
                >
                  <div 
                    style={{ 
                      backgroundColor: `rgba(var(--rgb-panel-overlay), ${settings.importBoxOpacity})`,
                      width: `var(--deck-card-width, ${10 * settings.uiScale}rem)`
                    }}
                    className="aspect-[5/7] military-border backdrop-blur-sm flex items-center justify-center group-hover:border-kards-gold transition-all rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
                  >
                    <Plus style={{ width: `${3 * settings.uiScale}rem`, height: `${3 * settings.uiScale}rem` }} className="text-kards-text-muted group-hover:text-kards-gold transition-colors" />
                  </div>
                  <span className="mt-4 text-sm font-bold text-kards-text-muted bg-kards-panel/80 px-4 py-1 rounded shadow-md border border-kards-border/50 backdrop-blur-md group-hover:text-kards-gold group-hover:border-kards-gold/50 group-hover:shadow-kards-gold/20 transition-all" style={{ fontSize: `${0.875 * settings.uiScale}rem` }}>新卡组</span>
                </button>
              </div>
            )}

            {activeMenu === 'decks' && settings.showDeckFolders && <DeckFolders
              folders={collections}
              decks={sortedDecks}
              selectedDeckId={activeDeckId}
              onSelect={deck => selectDeck(deck.id)}
              onHover={deck => hoverDeck(deck.id)}
              onHoverLeave={scheduleDeckHoverClose}
              onEdit={deck => { const stored = decks.find(item => item.id === deck.id); if (stored) openDeckEditor(stored); }}
              onCreate={() => { setNewCollectionName(''); setShowCreateCollectionModal(true); }}
              onRename={folder => { const stored = collections.find(item => item.id === folder.id); if (stored) { setCollectionToRename(stored); setRenameCollectionName(stored.name); } }}
              onDelete={folder => { const stored = collections.find(item => item.id === folder.id); if (stored) setCollectionToDelete(stored); }}
              onAdd={folder => setShowAddDeckToCollectionModal(folder.id)}
              onRemove={(folder, deck) => setCollections(current => current.map(item => item.id === folder.id ? { ...item, deckIds: item.deckIds.filter(id => id !== deck.id) } : item))}
              onFavorite={folder => setCollections(current => current.map(item => item.id === folder.id ? { ...item, isFavorite: !item.isFavorite } : item))}
            />}
          </div>
        </main>

        {/* Non-modal details float over the unchanged deck workspace. */}
        {activeMenu === 'decks' && selectedDeck && (
          <aside ref={deckDetailsRef} data-deck-details role="dialog" aria-modal="false" aria-label="卡组详情" tabIndex={-1} onMouseEnter={() => { clearDeckHoverOpen(); clearDeckHoverClose(); }} onMouseLeave={scheduleDeckHoverClose}
            className="glass-panel absolute bottom-5 right-5 top-5 z-30 flex w-[320px] max-w-[calc(100%-136px)] flex-col overflow-hidden rounded-lg border border-kards-border shadow-xl"
          >
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                key={selectedDeck.id}
                className="flex flex-col h-full"
              >
              <div className="flex shrink-0 items-center justify-between border-b border-kards-border px-4 py-2">
                <h2 className="text-sm font-bold text-kards-text">卡组详情</h2>
                <button onClick={closeDeckDetails} aria-label="关闭卡组详情" title="Esc 关闭卡组详情" className="rounded p-1 text-kards-text-muted hover:text-kards-text"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto no-scrollbar min-h-0 w-full">
                <input 
                  type="text"
                  value={selectedDeck.name || ''}
                  aria-label="管理卡组名称"
                  onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); } }}
                  onChange={(e) => handleNameChange(selectedDeck.id, e.target.value)}
                  className="deck-name-input mb-4"
                />
                
                <div className="mb-3 flex flex-col items-center gap-3 text-xs text-kards-text-muted">
                  <DeckCountIndicator mainNation={selectedDeck.mainNation} allyNation={selectedDeck.allyNation} mainCount={previewMainCount} allyCount={previewAllyCount} allyLimit={previewAllyLimit} total={previewTotalCards} limit={previewDeckLimit} />
                </div>
                <ul aria-label="卡组紧凑列表" className="space-y-0.5 text-sm">
                  <li><DeckHeadquartersStrip nation={selectedDeck.mainNation} headquartersId={selectedDeck.headquartersId} onClick={(headquarters, origin) => { selectDeck(selectedDeck.id); setDetailOrigin(origin); setDetailCard(null); setDetailHeadquarters(headquarters); }} /></li>
                  {previewEntries.map(entry => <li key={entry.id}><DeckCardStrip card={entry.card} importId={entry.id} count={entry.count} onClick={origin => {
                    if (entry.card) { selectDeck(selectedDeck.id); setDetailOrigin(origin); setDetailHeadquarters(null); setDetailCard(entry.card); }
                  }} /></li>)}
                </ul>
              </div>

              <div className="p-4 pt-4 border-t border-kards-border space-y-4 shrink-0 w-full min-w-0 transition-colors">
                <div className="flex items-center justify-center gap-2" data-testid="deck-detail-customization">
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {addingTagToDeckId === selectedDeck.id ? (
                      <input 
                        type="text"
                        autoFocus
                        className="bg-black border border-kards-gold px-2 py-1 text-xs text-kards-text max-w-[100px] focus:outline-none"
                        placeholder="输入标签..."
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === 'Enter') {
                            e.preventDefault(); e.stopPropagation();
                            const newTag = e.currentTarget.value.trim();
                            if (newTag) {
                              setDecks(decks.map(d => d.id === selectedDeck.id ? { ...d, tags: Array.from(new Set([...(d.tags || []), newTag])) } : d));
                            }
                            setAddingTagToDeckId(null);
                          } else if (e.key === 'Escape') {
                            e.preventDefault(); e.stopPropagation();
                            setAddingTagToDeckId(null);
                          }
                        }}
                        onBlur={() => setAddingTagToDeckId(null)}
                      />
                    ) : (
                      <button 
                        onClick={() => setAddingTagToDeckId(selectedDeck.id)}
                        className="deck-detail-option"
                      >
                        <Plus className="w-3 h-3" /> 添加标签
                      </button>
                    )}
                  </div>
                  <button onClick={() => { selectDeck(selectedDeck.id); setShowHeadquartersModal(selectedDeck.id); }} className="deck-detail-option">更换总部</button>
                  <button onClick={() => { selectDeck(selectedDeck.id); setShowCardBackModal(selectedDeck.id); }} className="deck-detail-option">更换卡背</button>
                  <DeckCostChart entries={previewCosts.entries} cardsById={previewCosts.cardsById} active hoverOnly className="deck-detail-option deck-detail-cost-chart-button" />
                </div>
                {!!selectedDeck.tags?.length && <div className="flex w-full items-center gap-2 overflow-x-auto custom-scrollbar">
                  {selectedDeck.tags?.map(tag => (
                    <div key={tag} className="flex flex-shrink-0 items-center gap-1 bg-kards-panel border border-kards-border text-xs px-2 py-1 rounded text-kards-text whitespace-nowrap">
                      <span>{tag}</span>
                      <button 
                        onClick={() => {
                          setDecks(decks.map(d => d.id === selectedDeck.id ? { ...d, tags: d.tags?.filter(t => t !== tag) } : d));
                        }}
                        className="hover:text-red-400 transition-colors ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>}

                <div className="flex gap-2">
                  <ActionButton 
                    label="删除卡组"
                    onClick={() => handleDeleteDeck(selectedDeck.id)}
                    icon={<Trash2 className="w-5 h-5" />}
                    className="bg-kards-panel hover:bg-kards-accent text-white border border-kards-border hover:text-white"
                  />
                  <ActionButton 
                    label="复制卡组码"
                    onClick={() => handleCopyCode(selectedDeck.code)}
                    icon={<Copy className="w-5 h-5" />}
                    className="bg-kards-panel hover:bg-kards-panel-hover border border-kards-border text-kards-text"
                  />
                  <ActionButton 
                    label="生成本地卡组图片"
                    onClick={() => handleGetDeckImage(selectedDeck)}
                    icon={<ImageIcon className="w-5 h-5" />}
                    className="bg-kards-panel hover:bg-kards-panel-hover border border-kards-border text-kards-text text-kards-gold"
                  />
                  <ActionButton 
                    label={selectedDeck.isFavorite ? '取消收藏卡组' : '收藏卡组'}
                    onClick={() => toggleFavorite(selectedDeck.id)}
                    icon={<Star className={`w-5 h-5 ${selectedDeck.isFavorite ? 'fill-kards-gold text-kards-gold' : ''}`} />}
                    className="bg-kards-panel hover:bg-kards-panel-hover border border-kards-border text-kards-text"
                  />
                </div>
                
                <button onClick={() => openDeckEditor(selectedDeck)} className="w-full bg-kards-text text-kards-bg font-bold py-3 uppercase tracking-widest text-sm hover:opacity-80 transition-colors flex items-center justify-center gap-2 rounded-md">
                  <Settings className="w-4 h-4" /> 编辑卡组
                </button>
              </div>
            </motion.div>
        </aside>
      )}
    </div>

      <ImageDownloadProgress />
      {activeMenu === 'decks' && (detailCard || detailHeadquarters) && <CardDetailModal card={detailCard || undefined} headquarters={detailHeadquarters || undefined} origin={detailOrigin} cards={cardDatabase} sequence={previewDetailSequence} onNavigate={item => revealDetailItem(item, 'strip', deckDetailsRef.current)} onClose={() => { setDetailCard(null); setDetailHeadquarters(null); }} />}

      {/* --- Clipboard Import Prompt --- */}
      <AnimatePresence>
        {clipboardDeckCandidate && !showImportModal && activeMenu !== 'deck-image' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              data-dialog-cancel onClick={handleDismissClipboardDeck}
              className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm"
            />
            <motion.div
              role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={handleDialogKeys}
              initial={{ scale: 0.92, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 18 }}
              className="glass-panel relative w-full max-w-md military-border p-6 shadow-2xl transition-all"
              style={{
                backgroundColor: `rgba(var(--rgb-panel-overlay), ${settings.importBoxOpacity})`,
                backdropFilter: `blur(${settings.importBoxOpacity * 10}px)`
              }}
            >
              <button
                data-dialog-cancel onClick={handleDismissClipboardDeck}
                className="absolute top-4 right-4 text-kards-text-muted hover:text-kards-text"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-kards-text">
                <Copy className="w-5 h-5 text-kards-gold" /> 检测到剪贴板卡组码
              </h3>

              <div className="space-y-3">
                <p className="text-sm text-kards-text-muted">
                  是否导入剪贴板中的卡组？
                </p>
                <div className="bg-kards-input-bg border border-kards-border rounded-md p-3">
                  <p className="text-sm font-bold text-kards-text truncate">{clipboardDeckCandidate.name}</p>
                  <p className="text-xs font-mono text-kards-gold break-all mt-1">{clipboardDeckCandidate.code}</p>
                </div>
              </div>

              <div className="flex gap-3 pt-5">
                <button
                  data-dialog-cancel onClick={handleDismissClipboardDeck}
                  className="flex-1 border border-kards-border py-3 font-bold hover:bg-kards-panel-hover transition-colors rounded-md"
                >
                  暂不导入
                </button>
                <button
                  data-dialog-confirm onClick={handleImportClipboardDeck}
                  className="flex-1 bg-kards-accent py-3 font-bold text-white hover:brightness-125 transition-all shadow-lg rounded-md"
                >
                  导入
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Import Modal --- */}
      {showNewDeckModal && <NewDeckDialog
        cards={cardDatabase}
        onClose={() => setShowNewDeckModal(false)}
        onCreate={() => {
          setShowNewDeckModal(false);
          setBuilderDeck({ name: '新卡组', code: '%%14|;;;' });
          setBuilderRevision(revision => revision + 1);
          setActiveMenu('builder');
        }}
        onImport={() => { setShowNewDeckModal(false); setErrorStatus(null); setShowImportModal(true); }}
        onPreset={preset => addDeckFromCode(preset.code, preset.name, undefined, preset.cardBackId)}
      />}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              data-dialog-cancel onClick={handleCloseImportModal}
              className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm"
            />
            <motion.div 
              role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={handleDialogKeys}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-panel relative w-full max-w-md military-border p-8 shadow-2xl transition-all"
              style={{ 
                backgroundColor: `rgba(var(--rgb-panel-overlay), ${settings.importBoxOpacity})`,
                backdropFilter: `blur(${settings.importBoxOpacity * 10}px)`
              }}
            >
              <button 
                data-dialog-cancel onClick={handleCloseImportModal}
                className="absolute top-4 right-4 text-kards-text-muted hover:text-kards-text"
              >
                <X className="w-6 h-6" />
              </button>
              
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Plus className="w-5 h-5 text-kards-gold" /> 导入卡组
              </h3>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-kards-text-muted mb-2 font-bold">卡组名称（选填）</label>
                  <input 
                    type="text" 
                    value={importName || ''}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="输入卡组名称，留空则默认以国家命名"
                    className="w-full bg-kards-input-bg border border-kards-border px-4 py-3 text-kards-text focus:outline-none focus:border-kards-gold transition-colors mb-4 rounded-md"
                  />
                  <DeckImageImport cards={cardDatabase} cancelRef={cancelImageImport} onBusyChange={setImportImageBusy} onError={setErrorStatus}
                    onRecognized={result => { setImportCode(result.code); setImportHeadquartersId(result.headquartersId); setImportCardBackId(result.cardBackId); if (result.name) setImportName(result.name); }} />
                  <label className="block text-xs uppercase tracking-wider text-kards-text-muted mb-2 mt-4 font-bold">卡组码</label>
                  <textarea
                    value={importCode || ''}
                    disabled={importImageBusy}
                    onChange={(e) => {
                      setImportCode(e.target.value);
                      setImportHeadquartersId(undefined);
                      setImportCardBackId(undefined);
                      setErrorStatus(null);
                    }}
                    placeholder="如：%%53|5ucCbn;5W6L... 也可以直接粘贴游戏内复制的整段卡组列表"
                    className={`w-full min-h-32 resize-y bg-kards-input-bg border ${errorStatus ? 'border-red-500' : 'border-kards-border'} px-4 py-3 text-kards-gold font-mono focus:outline-none focus:border-kards-gold transition-colors rounded-md`}
                    autoFocus
                  />
                  {errorStatus && (
                    <p className="text-red-500 text-xs mt-2 font-bold flex items-center gap-1">
                      <Zap className="w-3 h-3" /> {errorStatus}
                    </p>
                  )}
                </div>
                
                <div className="flex gap-4 pt-4">
                  <button 
                    data-dialog-cancel onClick={handleCloseImportModal}
                    className="flex-1 border border-kards-border py-3 font-bold hover:bg-kards-panel-hover transition-colors rounded-md"
                  >
                    取消
                  </button>
                  <button 
                    data-dialog-confirm onClick={handleAddDeck} disabled={importImageBusy}
                    className="flex-1 bg-kards-accent py-3 font-bold text-white hover:brightness-125 transition-all shadow-lg rounded-md disabled:opacity-40"
                  >
                    确认导入
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Tablecloth Modal --- */}
      <AnimatePresence>
        {showTableclothModal && (
          <div className={`fixed inset-0 flex items-center justify-center p-4 ${tableclothPickerForImage ? 'z-[100]' : 'z-50'}`}>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              data-dialog-cancel onClick={closeTableclothPicker}
              className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm"
            />
            <motion.div 
              role="dialog" aria-modal={cropQueue.length === 0} tabIndex={-1} onKeyDown={handleDialogKeys}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-panel relative w-full max-w-4xl max-h-[80vh] military-border p-8 shadow-2xl flex flex-col z-50 rounded-xl transition-colors"
              style={{ 
                backgroundColor: `rgba(var(--rgb-panel-overlay), ${settings.importBoxOpacity})` 
              }}
            >
              <button 
                data-dialog-cancel onClick={closeTableclothPicker}
                className="absolute top-4 right-4 text-kards-text-muted hover:text-kards-text"
              >
                <X className="w-6 h-6" />
              </button>
              
              <div className="flex items-center justify-between mb-6 border-b border-kards-border pb-4">
                <h3 className="text-2xl font-bold flex items-center gap-3">
                  <Palette className="w-6 h-6 text-kards-gold" /> 切换桌布
                </h3>
                
                <label className="flex items-center gap-2 bg-kards-accent px-4 py-2 font-bold cursor-pointer hover:brightness-125 transition-all text-sm text-white">
                  <Upload className="w-4 h-4" /> 上传自定义桌布
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleTableclothUpload}
                  />
                </label>
              </div>

              {tableclothUploadError && (
                <div className="mb-4 bg-red-500/20 border border-red-500 p-3 flex items-center gap-2 text-red-500 text-sm font-bold">
                  <Zap className="w-4 h-4" /> {tableclothUploadError}
                </div>
              )}
              
              <div className="flex-1 overflow-y-auto w-full no-scrollbar pr-2 pb-8">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {/* Custom Uploads */}
                  {customTablecloths.map((url, idx) => (
                    <div 
                      key={`custom-${idx}`}
                      onClick={() => chooseTablecloth(url)}
                      role="button" tabIndex={0} aria-label={`选择自定义桌布 ${idx + 1}`} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); chooseTablecloth(url); } }}
                      className={`aspect-video military-border overflow-hidden cursor-pointer group relative ${activeTableclothChoice === url ? 'ring-2 ring-kards-gold' : 'hover:brightness-110 opacity-80 hover:opacity-100'}`}
                    >
                      <img src={url} className="w-full h-full object-cover" alt={`Custom ${idx}`} />
                      {!tableclothPickerForImage && <div className="absolute top-1 right-1 opacity-80 group-hover:opacity-100 transition-opacity z-20">
                        {deleteConfirm?.id === `tc-${idx}` ? (
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(null);
                              }}
                              className="px-2 py-1 bg-kards-panel-alt text-kards-text text-[10px] font-bold rounded-sm uppercase tracking-tighter hover:bg-kards-panel-alt"
                            >取消</button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomTablecloths(prev => prev.filter((_, i) => i !== idx));
                                if (selectedTablecloth === url) setSelectedTablecloth(DEFAULT_TABLECLOTH);
                                setDeleteConfirm(null);
                              }}
                              className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded-sm uppercase tracking-tighter hover:bg-red-500"
                            >确认</button>
                          </div>
                        ) : (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({ type: 'tablecloth', id: `tc-${idx}` });
                            }}
                            className="p-1.5 bg-kards-modal-overlay hover:bg-red-600 rounded-sm text-red-500 hover:text-white transition-colors"
                            title="删除桌布"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>}
                      <div className="absolute inset-0 pointer-events-none bg-kards-gold/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Check className={`w-6 h-6 text-kards-text ${activeTableclothChoice === url ? 'opacity-100' : 'opacity-0'}`} />
                      </div>
                    </div>
                  ))}

                  {(tableclothPickerForImage ? ['default', 'wallpaper', 'headquarters'] as const : ['default', 'wallpaper'] as const).map(type => <React.Fragment key={type}>
                    <h4 className="col-span-full pt-3 text-xs font-bold text-kards-text-muted">{type === 'default' ? '默认桌布' : type === 'headquarters' ? '总部专属桌布' : '壁纸'}</h4>
                    {(tableclothPickerForImage ? TABLECLOTHS : USER_TABLECLOTHS).filter(item => item.type === type).map(item => (
                      <TableclothChoice key={item.id} item={item} selected={activeTableclothChoice === item.file} onChoose={chooseTablecloth} />
                    ))}
                  </React.Fragment>)}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {headquartersModalDeck && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowHeadquartersModal(null)} className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm" />
            <motion.section role="dialog" aria-modal="true" aria-label="更换总部" tabIndex={-1} onKeyDown={handleDialogKeys}
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-panel military-border relative flex max-h-[80vh] w-full max-w-4xl flex-col p-8 shadow-2xl">
              <button data-dialog-cancel onClick={() => setShowHeadquartersModal(null)} aria-label="关闭更换总部" className="absolute right-4 top-4 text-kards-text-muted hover:text-kards-text"><X className="h-6 w-6" /></button>
              <h3 className="mb-6 flex shrink-0 items-center gap-3 border-b border-kards-border pb-4 text-2xl font-bold"><ImageIcon className="h-6 w-6 text-kards-gold" />更换总部</h3>
              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
                <div className="deck-asset-grid headquarters-choice-grid">
                  {headquartersOptions(headquartersModalDeck.mainNation).map(headquarters => (
                    <button key={headquarters.groupId} type="button" aria-label={'使用总部 ' + headquarters.name}
                      aria-pressed={headquartersForDeck(headquartersModalDeck.headquartersId, headquartersModalDeck.mainNation)?.groupId === headquarters.groupId}
                      className="deck-asset-choice card-action group flex min-w-0 flex-col items-center"
                      onClick={() => {
                        setDecks(current => current.map(deck => deck.id === headquartersModalDeck.id ? { ...deck, headquartersId: headquarters.groupId } : deck));
                        setShowHeadquartersModal(null);
                      }}>
                      <span className="deck-asset-art military-border relative block w-full bg-kards-input-bg shadow-lg"><img src={headquarters.image} alt="" className="card-face h-full w-full object-contain" /></span>
                      <span className="mt-2 w-full truncate px-1 text-center text-xs text-kards-text-muted group-hover:text-kards-text" title={headquarters.name}>{headquarters.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCardBackModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              data-dialog-cancel onClick={() => setShowCardBackModal(null)}
              className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm"
            />
            <motion.div 
              role="dialog" aria-modal="true" aria-label="更换卡背" tabIndex={-1} onKeyDown={handleDialogKeys}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-panel relative w-full max-w-4xl max-h-[80vh] bg-kards-gray military-border p-8 shadow-2xl flex flex-col"
            >
              <button 
                data-dialog-cancel onClick={() => setShowCardBackModal(null)} aria-label="关闭更换卡背"
                className="absolute top-4 right-4 text-kards-text-muted hover:text-kards-text"
              >
                <X className="w-6 h-6" />
              </button>
              
              <div className="flex items-center justify-between mb-6 border-b border-kards-border pb-4">
                <h3 className="text-2xl font-bold flex items-center gap-3">
                  <ImageIcon className="w-6 h-6 text-kards-gold" /> 更换卡背
                </h3>
                
                <div className="flex gap-4">
                  {addingCategory ? (
                    <div className="flex items-center gap-2">
                       <input 
                         type="text"
                         value={newCatName || ''}
                         onChange={e => setNewCatName(e.target.value)}
                         placeholder="分类名称..."
                         className="bg-kards-input-bg border border-kards-border px-3 py-1 text-sm focus:outline-none focus:border-kards-gold text-kards-text w-32"
                         autoFocus
                         onKeyDown={e => {
                           if (e.nativeEvent.isComposing) return;
                           if (e.key === 'Enter') {
                             e.preventDefault(); e.stopPropagation();
                             if (!newCatName.trim()) return;
                             setCustomCategories(prev => [...prev, { id: 'cat_' + Date.now().toString(), name: newCatName.trim(), backs: [] }]);
                             setNewCatName('');
                             setAddingCategory(false);
                           } else if (e.key === 'Escape') {
                             e.preventDefault(); e.stopPropagation();
                             setAddingCategory(false);
                           }
                         }}
                       />
                       <button 
                         onClick={() => {
                           if (!newCatName.trim()) return;
                           setCustomCategories(prev => [...prev, { id: 'cat_' + Date.now().toString(), name: newCatName.trim(), backs: [] }]);
                           setNewCatName('');
                           setAddingCategory(false);
                         }}
                         className="bg-green-600 hover:bg-green-500 text-white px-2 py-1 flex items-center gap-1 text-sm"
                       ><Check className="w-4 h-4" /></button>
                       <button onClick={() => setAddingCategory(false)} className="bg-red-600 hover:bg-red-500 text-white px-2 py-1"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setAddingCategory(true)}
                      className="flex items-center gap-2 text-sm text-kards-text-muted hover:text-kards-text transition-colors"
                    >
                      <FolderPlus className="w-4 h-4" /> 添加分类
                    </button>
                  )}

                  <button 
                    onClick={() => {
                      setUploadError(null);
                      setUploadCategory(allCategories.length > 0 ? allCategories[0].id : '');
                      setShowUploadModal(true);
                    }}
                    className="flex items-center gap-2 bg-kards-accent px-4 py-2 font-bold hover:brightness-125 transition-all"
                  >
                    <Upload className="w-4 h-4" /> 上传卡背
                  </button>
                </div>
              </div>

              {uploadError && (
                <div className="mb-4 bg-red-500/20 border border-red-500 p-3 flex items-center gap-2 text-red-500 text-sm font-bold">
                  <Zap className="w-4 h-4" /> {uploadError}
                </div>
              )}
              
              <div className="flex-1 overflow-y-auto w-full no-scrollbar pr-2 pb-8">
                {allCategories.map(category => (
                  <div key={category.id} className="mb-8 relative auto-animate">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-kards-text-muted uppercase tracking-widest flex items-center gap-2">
                        <span className="w-4 h-[1px] bg-kards-panel-alt" />
                        {category.name} {category.isCustom && <span className="text-xs font-normal text-kards-gold border border-kards-gold px-1 rounded-sm ml-2">自定义</span>}
                        <span className="flex-1 h-[1px] bg-kards-panel-alt" />
                      </h4>
                      {category.isCustom && (
                        <button 
                          onClick={() => {
                            if (window.confirm(`确定要删除分类“${category.name}”及其包含的文件吗？`)) {
                              setCustomCategories(prev => prev.filter(c => c.id !== category.id));
                            }
                          }}
                          className="text-xs text-red-500 hover:text-red-400 flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity"
                        >
                          删除分类
                        </button>
                      )}
                    </div>
                    {category.backs.length === 0 ? (
                      <div className="text-center py-8 text-kards-text-muted text-sm italic bg-black/20 border border-kards-border">
                        暂无自定义卡背
                      </div>
                    ) : (
                      <div className="deck-asset-grid">
                        {category.backs.map((back: any) => (
                          <div 
                            key={back.id}
                            className={`flex flex-col items-center group relative ${deleteConfirm?.id === back.id ? '' : 'cursor-pointer'}`}
                            onClick={() => {
                              if (deleteConfirm?.id === back.id) return;
                              const catalogBack = CARD_BACKS.find(item => item.file === back.url);
                              setDecks(current => current.map(d => d.id === showCardBackModal ? { ...d, cardBackUrl: back.url, cardBackScope: catalogBack?.scope, cardBackNation: catalogBack?.nation } : d));
                              setShowCardBackModal(null);
                            }}
                          >
                            <div className="w-full aspect-[5/7] military-border overflow-hidden bg-kards-input-bg group-hover:border-kards-gold transition-colors relative shadow-black/50 shadow-lg">
                              <img 
                                src={back.url} 
                                alt={back.name} 
                                className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                                onError={(e) => {
                                  e.currentTarget.src = DEFAULT_CARD_BACK;
                                }}
                              />
                              <div className="absolute inset-0 pointer-events-none bg-kards-gold/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                              
                              {back.isCustomCard && (
                                <div className="absolute top-1 right-1 flex gap-1 opacity-80 group-hover:opacity-100 transition-opacity z-20">
                                  {deleteConfirm?.id === back.id ? (
                                    <div className="flex gap-1 bg-kards-modal-overlay p-1 rounded-sm shadow-xl border border-kards-border" onClick={e => e.stopPropagation()}>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeleteConfirm(null);
                                        }}
                                        className="px-1.5 py-0.5 bg-kards-panel-alt text-kards-text text-[10px] font-bold rounded-sm hover:bg-kards-panel-alt"
                                      >取消</button>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCustomCategories(prev => prev.map(c => 
                                            c.id === category.id ? { ...c, backs: c.backs.filter((b: any) => b.id !== back.id) } : c
                                          ));
                                          setDeleteConfirm(null);
                                        }}
                                        className="px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-bold outline outline-1 outline-white/20 rounded-sm hover:bg-red-500"
                                      >删除</button>
                                    </div>
                                  ) : (
                                    <>
                                      {customCategories.length > 0 && (
                                        <button 
                                          className="p-1 bg-kards-modal-overlay hover:bg-kards-accent text-white"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setMovingCardInfo({catId: category.id, backId: back.id});
                                          }}
                                        >
                                          <ArrowRightLeft className="w-4 h-4" />
                                        </button>
                                      )}
                                      <button 
                                        className="p-1 bg-kards-modal-overlay hover:bg-green-600 text-white"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingCardInfo({catId: category.id, backId: back.id});
                                          setEditingCardName(back.name);
                                        }}
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button 
                                        className="p-1 bg-kards-modal-overlay hover:bg-red-600 text-red-500 hover:text-white"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeleteConfirm({ type: 'cardback', id: back.id, catId: category.id });
                                        }}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}

                              {movingCardInfo?.backId === back.id && back.isCustomCard && (
                                <div className="absolute inset-0 z-30 bg-kards-modal-overlay flex flex-col items-center justify-center p-2" onClick={e => e.stopPropagation()}>
                                  <span className="text-kards-text text-xs mb-2">移动至...</span>
                                  <CustomSelect label="移动卡背分类" placeholder="选择分类" className="w-full mb-2" value="" onChange={(value) => {
                                      if(value) {
                                        const newCatId = value;
                                        setCustomCategories(prev => {
                                           const oldCat = prev.find(c => c.id === category.id);
                                           const b = oldCat?.backs.find((bk: any) => bk.id === back.id);
                                           if (!b) return prev;
                                           return prev.map(c => {
                                               if (c.id === category.id) return { ...c, backs: c.backs.filter((bk: any) => bk.id !== back.id) };
                                               if (c.id === newCatId) return { ...c, backs: [...c.backs, b] };
                                               return c;
                                           });
                                        });
                                        setMovingCardInfo(null);
                                      }
                                    }} options={allCategories.filter(c => c.id !== category.id).map(c => ({ value: c.id, label: c.name }))} />
                                  <button className="text-kards-gold hover:text-kards-text text-xs" onClick={() => setMovingCardInfo(null)}>取消</button>
                                </div>
                              )}
                            </div>
                            {editingCardInfo?.backId === back.id && back.isCustomCard ? (
                               <div className="mt-2 w-full flex items-center px-2 z-40" onClick={e => e.stopPropagation()}>
                                  <input 
                                     autoFocus
                                     className="w-full bg-black border border-kards-gold text-kards-text text-xs px-1 py-0.5 focus:outline-none"
                                     value={editingCardName || ''}
                                     onChange={e => setEditingCardName(e.target.value)}
                                     onKeyDown={e => {
                                        if (e.nativeEvent.isComposing) return;
                                        if (e.key === 'Enter') {
                                           e.preventDefault(); e.stopPropagation();
                                           if (!editingCardName.trim()) return;
                                           setCustomCategories(prev => prev.map(c => c.id === category.id ? {
                                              ...c,
                                              backs: c.backs.map((b: any) => b.id === back.id ? { ...b, name: editingCardName.trim() } : b)
                                           } : c));
                                           setEditingCardInfo(null);
                                        } else if (e.key === 'Escape') {
                                           e.preventDefault(); e.stopPropagation();
                                           setEditingCardInfo(null);
                                        }
                                     }}
                                     onBlur={() => {
                                         if (!editingCardName.trim()) return;
                                         setCustomCategories(prev => prev.map(c => c.id === category.id ? {
                                            ...c,
                                            backs: c.backs.map((b: any) => b.id === back.id ? { ...b, name: editingCardName.trim() } : b)
                                         } : c));
                                         setEditingCardInfo(null);
                                     }}
                                  />
                               </div>
                            ) : (
                               <span className="mt-2 text-xs text-center truncate w-full px-2 text-kards-text-muted group-hover:text-kards-text transition-colors">{back.name}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddDeckToCollectionModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              data-dialog-cancel onClick={() => setShowAddDeckToCollectionModal(null)}
              className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-md"
            />
            <motion.div 
              role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={handleDialogKeys}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel relative w-full max-w-2xl military-border shadow-2xl flex flex-col max-h-[70vh] transition-all"
              style={{ 
                backgroundColor: `rgba(var(--rgb-panel-overlay), ${settings.importBoxOpacity})`,
                backdropFilter: `blur(${settings.importBoxOpacity * 10}px)`
              }}
            >
              <div className="p-6 border-b border-kards-border flex items-center justify-between">
                <h3 className="text-xl font-bold tracking-widest text-kards-text">选择要添加的卡组</h3>
                <button data-dialog-cancel onClick={() => setShowAddDeckToCollectionModal(null)} className="text-kards-text-muted hover:text-kards-text"><X className="w-6 h-6" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
                {decks.filter(d => {
                  const col = collections.find(c => c.id === showAddDeckToCollectionModal);
                  return col && !col.deckIds.includes(d.id);
                }).length === 0 ? (
                  <div className="text-center py-10 text-kards-text-muted">没有可选的卡组</div>
                ) : (
                  decks.filter(d => {
                    const col = collections.find(c => c.id === showAddDeckToCollectionModal);
                    return col && !col.deckIds.includes(d.id);
                  }).map(deck => (
                    <button type="button"
                      key={deck.id}
                      onClick={() => {
                        setCollections(collections.map(c => c.id === showAddDeckToCollectionModal ? { ...c, deckIds: [...c.deckIds, deck.id] } : c));
                        setShowAddDeckToCollectionModal(null);
                      }}
                      className="flex w-full items-center gap-4 p-4 text-left bg-kards-panel hover:bg-kards-panel-hover transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-1">
                        <img src={getFlagUrl(NATION_DATA[deck.mainNation].flag)} className="w-6 h-4 object-contain" alt="main" />
                        {deck.allyNation && <img src={getFlagUrl(NATION_DATA[deck.allyNation].flag)} className="w-5 h-3.5 object-contain opacity-70" alt="ally" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-kards-text group-hover:text-kards-gold transition-colors">{deck.name}</span>
                        <span className="text-xs font-mono text-kards-text-muted">{deck.code}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Crop Modal --- */}
      <AnimatePresence>
        {cropQueue.length > 0 && (
          <div className={`fixed inset-0 flex items-center justify-center p-4 ${tableclothPickerForImage ? 'z-[110]' : 'z-[70]'}`}>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm"
            />
            <motion.div 
              role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={handleDialogKeys}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-panel relative w-full max-w-2xl bg-kards-gray-alt military-border p-6 shadow-2xl flex flex-col items-center"
            >
              <h3 className="text-xl font-bold mb-4 text-center">
                裁剪 {cropQueue[0].type === 'cardback' ? '卡背' : '桌布'}
              </h3>
              
              <div className="relative w-full h-[60vh] bg-kards-input-bg">
                <Cropper
                  image={cropQueue[0].url}
                  crop={cropState.crop}
                  zoom={cropState.zoom}
                  aspect={cropQueue[0].type === 'cardback' ? 5 / 7 : 16 / 9}
                  minZoom={0.1}
                  maxZoom={3}
                  restrictPosition={false}
                  onCropChange={(crop) => setCropState(s => ({ ...s, crop }))}
                  onZoomChange={(zoom) => setCropState(s => ({ ...s, zoom }))}
                  onCropComplete={handleCropComplete}
                />
              </div>

              <div className="w-full flex flex-col gap-4 my-6 text-kards-text bg-black/20 p-4 military-border">
                {/* Position Controls */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold w-12 shrink-0 tracking-widest text-kards-text-muted">位置</span>
                  <div className="flex-1 flex items-center justify-center gap-2">
                    <button onClick={() => setCropState(s => ({ ...s, crop: { ...s.crop, x: s.crop.x - 1 } }))} className="w-8 h-8 flex items-center justify-center bg-kards-panel hover:bg-kards-panel-hover border border-kards-border transition-colors">←</button>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => setCropState(s => ({ ...s, crop: { ...s.crop, y: s.crop.y - 1 } }))} className="w-8 h-8 flex items-center justify-center bg-kards-panel hover:bg-kards-panel-hover border border-kards-border transition-colors">↑</button>
                      <button onClick={() => setCropState(s => ({ ...s, crop: { ...s.crop, y: s.crop.y + 1 } }))} className="w-8 h-8 flex items-center justify-center bg-kards-panel hover:bg-kards-panel-hover border border-kards-border transition-colors">↓</button>
                    </div>
                    <button onClick={() => setCropState(s => ({ ...s, crop: { ...s.crop, x: s.crop.x + 1 } }))} className="w-8 h-8 flex items-center justify-center bg-kards-panel hover:bg-kards-panel-hover border border-kards-border transition-colors">→</button>
                  </div>
                  <div className="text-[10px] font-mono text-kards-text-muted w-12 text-right">
                    {Math.round(cropState.crop.x)}, {Math.round(cropState.crop.y)}
                  </div>
                </div>

                <hr className="border-kards-border" />

                {/* Zoom Controls */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold w-12 shrink-0 tracking-widest text-kards-text-muted">缩放</span>
                  <button onClick={() => setCropState(s => ({ ...s, zoom: Math.max(0.1, s.zoom - 0.01) }))} className="px-3 py-1 bg-kards-panel hover:bg-kards-panel-hover font-bold border border-kards-border">-</button>
                  <input
                    type="range"
                    value={cropState.zoom || 1}
                    min={0.1}
                    max={3}
                    step={0.0001}
                    aria-labelledby="Zoom"
                    onChange={(e) => setCropState(s => ({ ...s, zoom: Number(e.target.value) }))}
                    className="flex-1 accent-kards-gold"
                  />
                  <button onClick={() => setCropState(s => ({ ...s, zoom: Math.min(3, s.zoom + 0.01) }))} className="px-3 py-1 bg-kards-panel hover:bg-kards-panel-hover font-bold border border-kards-border">+</button>
                  <span className="text-sm font-mono w-12 shrink-0 text-right text-kards-gold">{cropState.zoom.toFixed(4)}x</span>
                </div>
              </div>

              <div className="flex w-full gap-4">
                <button 
                  data-dialog-cancel onClick={handleCancelCrop}
                  className="flex-1 py-2 text-kards-text-muted hover:text-kards-text hover:bg-kards-panel-hover transition-colors border border-kards-border"
                >
                  跳过 / 取消
                </button>
                <button 
                  data-dialog-confirm onClick={handleNextCrop}
                  className="flex-1 py-2 bg-kards-accent text-white font-bold hover:brightness-125 transition-all shadow-lg"
                >
                  确认裁剪 ({cropQueue.length} 剩余)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Upload Modal --- */}
      <AnimatePresence>
        {showUploadModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              data-dialog-cancel onClick={() => setShowUploadModal(false)}
              className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm"
            />
            <motion.div 
              role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={handleDialogKeys}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-panel relative w-full max-w-sm bg-kards-gray-alt military-border p-6 shadow-2xl flex flex-col items-center"
            >
              <h3 className="text-xl font-bold mb-4 text-center">上传自定义卡背</h3>
              <div className="w-full mb-4">
                <label className="block text-sm text-kards-text-muted mb-2">选择分类</label>
                <CustomSelect label="上传卡背分类" className="w-full" value={uploadCategory || ''} placeholder="选择分类" onChange={setUploadCategory} options={[...allCategories.filter(c => !c.isCustom), ...allCategories.filter(c => c.isCustom)].map(c => ({ value: c.id, label: c.name, group: c.isCustom ? '自定义分类' : '默认分类' }))} />
              </div>
              <div className="relative w-full">
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple
                  onChange={handleMultiFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="w-full bg-kards-accent hover:brightness-125 transition-all text-center py-3 font-bold flex items-center justify-center gap-2">
                  <Upload className="w-5 h-5" /> 选择文件并上传
                </div>
              </div>
              <button 
                data-dialog-cancel onClick={() => setShowUploadModal(false)}
                className="mt-4 text-sm text-kards-text-muted hover:text-kards-text transition-colors"
              >
                取消
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Create Collection Modal --- */}
      <AnimatePresence>
        {showCreateCollectionModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              data-dialog-cancel onClick={() => setShowCreateCollectionModal(false)}
              className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm"
            />
            <motion.div 
              role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={handleDialogKeys}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-panel relative w-full max-w-md military-border p-6 shadow-2xl flex flex-col transition-all"
              style={{ 
                backgroundColor: `rgba(var(--rgb-panel-overlay), ${settings.importBoxOpacity})`,
                backdropFilter: `blur(${settings.importBoxOpacity * 10}px)`
              }}
            >
              <h3 className="text-xl font-bold mb-4 text-kards-text tracking-widest">创建新收藏夹</h3>
              <input
                type="text"
                autoFocus
                value={newCollectionName || ''}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && newCollectionName.trim()) {
                    e.preventDefault(); e.stopPropagation();
                    setCollections([...collections, {
                      id: Date.now().toString(),
                      name: newCollectionName.trim(),
                      deckIds: [],
                      isFavorite: false,
                      createdAt: Date.now()
                    }]);
                    setShowCreateCollectionModal(false);
                  }
                }}
                placeholder="请输入收藏夹名称..."
                className="w-full bg-kards-bg border border-kards-border text-kards-text p-3 mb-6 focus:outline-none focus:border-kards-gold"
              />
              <div className="flex gap-4">
                <button 
                  data-dialog-cancel onClick={() => setShowCreateCollectionModal(false)}
                  className="flex-1 py-2 text-kards-text-muted hover:text-kards-text hover:bg-kards-panel-hover transition-colors"
                >
                  取消
                </button>
                <button data-dialog-confirm
                  disabled={!newCollectionName.trim()}
                  onClick={() => {
                    if (newCollectionName.trim()) {
                      setCollections([...collections, {
                        id: Date.now().toString(),
                        name: newCollectionName.trim(),
                        deckIds: [],
                        isFavorite: false,
                        createdAt: Date.now()
                      }]);
                      setShowCreateCollectionModal(false);
                    }
                  }}
                  className="flex-1 bg-kards-accent text-white font-bold py-2 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-125 transition-all"
                >
                  创建
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Delete Collection Modal --- */}
      <AnimatePresence>
        {collectionToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              data-dialog-cancel onClick={() => setCollectionToDelete(null)}
              className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm"
            />
            <motion.div 
              role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={handleDialogKeys}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-panel relative w-full max-w-sm bg-kards-gray-alt border-t-4 border-red-600 p-6 shadow-2xl flex flex-col items-center"
            >
              <Trash2 className="w-12 h-12 text-red-500 mb-4" />
              <h3 className="text-lg font-bold mb-2 text-center text-kards-text">删除收藏夹</h3>
              <p className="text-kards-text-muted text-center mb-6 text-sm">
                确定要删除收藏夹 <span className="text-kards-text font-bold">"{collectionToDelete.name}"</span> 吗？卡组会保留，仅移除此收藏夹。
              </p>
              <div className="flex w-full gap-4">
                <button 
                  data-dialog-cancel onClick={() => setCollectionToDelete(null)}
                  className="flex-1 py-2 text-kards-text-muted hover:text-kards-text hover:bg-kards-panel-hover transition-colors border border-kards-border"
                >
                  取消
                </button>
                <button data-dialog-confirm
                  onClick={() => {
                    setCollections(collections.filter(c => c.id !== collectionToDelete.id));
                    setCollectionToDelete(null);
                  }}
                  className="flex-1 bg-red-600 text-white font-bold py-2 hover:bg-red-500 transition-colors shadow-lg"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Rename Collection Modal --- */}
      <AnimatePresence>
        {collectionToRename && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              data-dialog-cancel onClick={() => setCollectionToRename(null)}
              className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm"
            />
            <motion.div 
              role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={handleDialogKeys}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-panel relative w-full max-w-md bg-kards-gray military-border p-6 shadow-2xl flex flex-col"
            >
              <h3 className="text-xl font-bold mb-4 text-kards-text tracking-widest">重命名收藏夹</h3>
              <input
                type="text"
                autoFocus
                value={renameCollectionName || ''}
                onChange={(e) => setRenameCollectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && renameCollectionName.trim()) {
                    e.preventDefault(); e.stopPropagation();
                    setCollections(collections.map(c => 
                      c.id === collectionToRename.id ? { ...c, name: renameCollectionName.trim() } : c
                    ));
                    setCollectionToRename(null);
                  }
                }}
                placeholder="请输入新的收藏夹名称..."
                className="w-full bg-kards-bg border border-kards-border text-kards-text p-3 mb-6 focus:outline-none focus:border-kards-gold"
              />
              <div className="flex gap-4">
                <button 
                  data-dialog-cancel onClick={() => setCollectionToRename(null)}
                  className="flex-1 py-2 text-kards-text-muted hover:text-kards-text hover:bg-kards-panel-hover transition-colors"
                >
                  取消
                </button>
                <button data-dialog-confirm
                  disabled={!renameCollectionName.trim()}
                  onClick={() => {
                    if (renameCollectionName.trim()) {
                      setCollections(collections.map(c => 
                        c.id === collectionToRename.id ? { ...c, name: renameCollectionName.trim() } : c
                      ));
                      setCollectionToRename(null);
                    }
                  }}
                  className="flex-1 bg-kards-accent text-white font-bold py-2 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-125 transition-all"
                >
                  确认
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Deck Image Modal --- */}
      <AnimatePresence>
        {deckImageModal.show && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              data-dialog-cancel onClick={closeDeckImage}
              className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-md"
            />
            <motion.div 
              role="dialog" aria-modal={!tableclothPickerForImage} tabIndex={-1} onKeyDown={handleDialogKeys}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel relative w-full max-w-3xl bg-kards-gray-alt military-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-4 border-b border-kards-border flex items-center justify-between bg-kards-gray">
                <h3 className="text-lg font-bold tracking-widest text-kards-text flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-kards-gold" />
                  本地卡组图片 {deckImageModal.deck && `- ${deckImageModal.deck.name}`}
                </h3>
                <button data-dialog-cancel onClick={closeDeckImage} aria-label="关闭卡组图片预览" className="text-kards-text-muted hover:text-kards-text">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="m-3 flex flex-wrap items-center justify-end gap-2">
                <button disabled={deckImageModal.loading || deckImageModal.miniLoading || !deckImageModal.imageUrl} onClick={generateMiniDeckImage} className="mr-auto rounded border border-kards-border px-4 py-2 text-sm font-bold disabled:opacity-40">{deckImageModal.miniLoading ? '正在生成迷你分享图…' : deckImageModal.view === 'mini' ? '切换到完整卡组图' : '切换到迷你分享图'}</button>
                <button disabled={deckImageModal.loading || deckImageModal.miniLoading || !deckImageModal.deck} onClick={() => openTableclothPicker(true)} className="flex items-center gap-2 rounded border border-kards-border px-4 py-2 text-sm font-bold disabled:opacity-40"><Palette className="h-4 w-4" />更换桌布</button>
                {deckImageModal.imageUrl && <button data-dialog-confirm disabled={deckImageModal.miniLoading} onClick={() => downloadDeckImage((deckImageModal.view === 'mini' ? deckImageModal.miniImageUrl : deckImageModal.imageUrl)!, (deckImageModal.deck?.name || 'kards-deck') + (deckImageModal.view === 'mini' ? '-mini' : ''))} className="rounded bg-kards-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-40">下载 PNG 图片</button>}
              </div>
              <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center bg-kards-bg">
                {deckImageModal.loading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-kards-text-muted">
                    <div className="w-12 h-12 border-4 border-kards-gold border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="font-bold tracking-widest">正在本机生成图片…</p>
                  </div>
                ) : deckImageModal.error ? (
                  <div className="flex flex-col items-center justify-center py-12 text-red-400 max-w-md text-center">
                    <Zap className="w-16 h-16 mb-4 opacity-50" />
                    <p className="font-bold mb-2">获取失败</p>
                    <p className="text-sm opacity-80">{deckImageModal.error}</p>

                  </div>
                ) : deckImageModal.imageUrl ? (
                  <img 
                    src={(deckImageModal.view === 'mini' ? deckImageModal.miniImageUrl : deckImageModal.imageUrl)!}
                    alt={deckImageModal.view === 'mini' ? '迷你分享图' : '本地卡组图片'}
                    className="max-w-full max-h-[70vh] object-contain shadow-2xl"
                    style={deckImageModal.view === 'mini' ? { width: 342, height: 'auto', flexShrink: 0 } : undefined}
                  />
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

// --- Subcomponents ---

function SidebarButton({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`
        w-full aspect-square flex flex-col items-center justify-center gap-1 transition-all
        ${active ? 'bg-kards-accent text-white shadow-inner scale-[0.98]' : 'text-kards-text-muted hover:bg-kards-panel-hover hover:text-white'}
        relative overflow-hidden group
      `}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
      {active && (
        <div className="absolute right-0 top-0 bottom-0 w-1 bg-kards-gold shadow-[0_0_10px_rgba(197,160,89,0.5)]" />
      )}
    </button>
  );
}

interface DeckCardProps {
  deck: Deck;
  selected: boolean;
  onClick: () => void;
  onHover: () => void;
  onHoverLeave: () => void;
  onDoubleClick: () => void;
  settings: AppSettings;
  hasReserved: boolean;
  key?: React.Key;
}

function DeckCard({ deck, selected, onClick, onHover, onHoverLeave, onDoubleClick, settings, hasReserved }: DeckCardProps) {
  const mainData = NATION_DATA[deck.mainNation];
  const allyData = deck.allyNation ? NATION_DATA[deck.allyNation] : null;
  const cardBack = cardBackForDeck(deck);
  const fallbackCardBack = defaultCardBackForNation(deck.mainNation);

  return (
    <motion.button
      type="button"
      aria-label={`选择卡组 ${deck.name}`}
      aria-pressed={selected}
      whileHover={{ y: -5 }}
      className="flex min-w-0 flex-col items-center group cursor-pointer"
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onHoverLeave}
      onDoubleClick={onDoubleClick}
    >
      <div 
        style={{ width: `var(--deck-card-width, ${10 * settings.uiScale}rem)` }}
        className={`
          aspect-[5/7] relative transition-all duration-300 shrink-0
          ${selected ? 'scale-105 z-10' : 'hover:brightness-110'}
        `}
      >
        {/* Card Body */}
        <div 
          style={{ 
            backgroundColor: `rgba(var(--rgb-panel-overlay), ${settings.importBoxOpacity})` 
          }}
          className={`
            w-full h-full paper-texture military-border relative overflow-hidden backdrop-blur-[2px] flex flex-col items-center justify-center rounded-md transition-all
            ${selected ? 'ring-4 ring-kards-gold ring-offset-4 ring-offset-kards-bg' : ''}
          `}
        >
          <img 
            src={cardBack || DEFAULT_CARD_BACK}
            alt={deck.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 rounded-md"
            onError={(e) => { 
                if (e.currentTarget.getAttribute('data-error')) return;
                e.currentTarget.setAttribute('data-error', 'true');
                e.currentTarget.src = fallbackCardBack || DEFAULT_CARD_BACK;
            }}
          />
          
          {/* Small flags at the bottom center */}
          <div 
            className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-end gap-1 bg-black/70 p-1 rounded-sm backdrop-blur-sm border border-kards-border z-10 origin-bottom"
            style={{ transform: `translateX(-50%) scale(${settings.uiScale})` }}
          >
            <img src={getFlagUrl(mainData.flag)} className="w-5 h-3.5 object-contain" alt="main" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            {allyData && (
              <div className="flex items-end gap-1">
                 <div className="w-[1px] h-3 bg-white/20" />
                 <img src={getFlagUrl(allyData.flag)} className="w-3.5 h-2.5 object-contain opacity-80" alt="ally" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              </div>
            )}
            {hasReserved && <ReservedBadge label="卡组含预备卡" className="deck-cover-reserved" />}
          </div>

          {/* Warnings on card back */}
          <div 
            className="absolute inset-0 flex flex-col items-center justify-end p-2 pb-8 gap-1 pointer-events-none origin-bottom"
            style={{ transform: `scale(${settings.uiScale})` }}
          >
            {deck.warnings.filter(warning => !warning.endsWith(' 是预备卡')).map((w, i) => (
              <span key={i} className="bg-red-600/90 text-[10px] text-white px-2 py-0.5 font-bold uppercase tracking-tight shadow-lg whitespace-nowrap">
                {w}
              </span>
            ))}
            {deck.ruleSet === 'arena' && (
              <span className="bg-kards-gold/90 text-[10px] text-black px-2 py-0.5 font-bold uppercase tracking-tight shadow-lg">
                {deckModeLabel('arena')}
              </span>
            )}
          </div>

          {/* Favorite Indicator */}
          {deck.isFavorite && (
            <div 
              className="absolute -top-1 -left-1 text-kards-gold drop-shadow-[0_0_12px_rgba(197,160,89,1)] origin-top-left"
              style={{ transform: `scale(${settings.uiScale})` }}
            >
              <Star className="w-12 h-12 fill-current" />
            </div>
          )}
        </div>
        
        {/* Worn edge effect */}
        <div className="absolute inset-0 pointer-events-none border border-black/10 m-1" />
      </div>

      <div className="mt-4 flex w-full min-w-0 flex-col items-center gap-2">
        <span title={deck.name} className={`max-w-full truncate text-sm font-bold tracking-tight text-center px-4 py-1 rounded shadow-md backdrop-blur-md border transition-all ${selected ? 'text-kards-gold bg-kards-panel border-kards-gold/50 shadow-kards-gold/20' : 'text-kards-text bg-kards-panel/80 border-kards-border/50'}`}>
          {deck.name}
        </span>
      </div>
    </motion.button>
  );
}

function ActionButton({ onClick, icon, label, className = "" }: { onClick: () => void, icon: React.ReactNode, label: string, className?: string }) {
  return (
    <button 
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex-1 h-12 flex items-center justify-center transition-all military-border rounded-sm ${className}`}
    >
      {icon}
    </button>
  );
}
