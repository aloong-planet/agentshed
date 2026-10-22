// The landing page's copy, in its two languages (landing-page::CON-002). Chinese is at `/`, English at `/en`.
//
// This dictionary is the site's own and is separate from the app's (src/shared/i18n/): the page is a front
// door outside ADR-0013's scope, so its two languages are its own choice (ADR-0031 option 6); the app
// speaks the same two (ADR-0035). The copy is the confirmed prototype's (2026-10-13, revised 2026-10-21). Both languages
// satisfy one type, so a key present in one and missing in the other fails `astro check`.

export const LOCALES = ['zh', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** The value of each page's `<html lang>` */
export const HTML_LANG: Record<Locale, string> = { zh: 'zh-CN', en: 'en' }

/** Each page's path: Chinese is the default language at the root */
export const PAGE_PATH: Record<Locale, string> = { zh: '/', en: '/en/' }

/** The language toggle names each language in its own script, the same on both pages */
export const LANGUAGE_NAME: Record<Locale, string> = { zh: '中文', en: 'EN' }

/** One step of the features section, in the order of FEATURE_SHOTS */
interface FeatureStep {
  title: string
  body: string
  /** The screenshot's alternative text */
  alt: string
}

interface InstallStep {
  title: string
  body: string
}

export interface Dictionary {
  nav: { features: string; install: string; download: string; github: string }
  /** The language toggle's accessible name */
  language: string
  hero: {
    title: string
    lede: string
    /** The line beneath the download button */
    platform: string
    shotAlt: string
  }
  features: {
    title: string
    subtitle: string
    steps: readonly [FeatureStep, FeatureStep, FeatureStep, FeatureStep, FeatureStep, FeatureStep]
  }
  install: { title: string; steps: readonly [InstallStep, InstallStep, InstallStep] }
  download: {
    title: string
    label: string
    labelSub: string
    /** The list state (landing-page::REQ-002/AC-04): the page cannot tell which release exists */
    list: { hero: string; line: string; button: string }
    /** The formal states, from R2 or from GitHub (landing-page::REQ-002/AC-01, AC-02); {version} is the version */
    formal: { hero: string; every: string; line: string; download: string; github: string }
    /** The test state (landing-page::REQ-002/AC-03): only a pre-release exists */
    test: { hero: string; pill: string; note: string; line: string; button: string }
  }
  footer: { github: string; releases: string; copyright: string }
}

const zh: Dictionary = {
  nav: { features: '功能', install: '安装', download: '下载', github: 'GitHub' },
  language: '语言',
  hero: {
    title: '你的 coding agent，尽收眼底',
    lede: '一处看清 Claude Code、Codex 等 coding agent 在每个项目里装了哪些 skills、plugins 与 MCP，记住了什么，烧了多少 token；每次会话按提问回看，所有项目一起搜索；还能把全局 skill 装进任意项目。',
    platform: 'macOS 12 及以上 · Apple Silicon',
    shotAlt: 'Agentshed 的 Agents 总览'
  },
  features: {
    title: '一个应用，看清全部',
    subtitle: '它只读取你本机上 coding agent 留下的文件。',
    steps: [
      {
        title: '全局总览',
        body: '每个 coding agent 装了什么、一共烧了多少 token，打开就是全景。',
        alt: '所有 agent 侧的 skills 合并在一张表里'
      },
      {
        title: '每个项目装了什么',
        body: 'skills、subagents、plugins、MCP 与配置，按项目实际生效的样子列出来。',
        alt: '一个项目的 Skills 页'
      },
      {
        title: 'agent 记住了什么',
        body: '每个项目里 agent 跨会话记住的内容，在全局页按项目汇总，点开一份就在抽屉里读全文。',
        alt: 'Agents 页的记忆分页，抽屉里打开了一份记忆'
      },
      {
        title: 'Token 用量与趋势',
        body: '按天、按项目、按模型拆开看，历史用量本地存档，不怕 agent 自己清理会话。',
        alt: '一个项目的 token 总量、趋势与按模型拆分'
      },
      {
        title: '会话回看',
        body: '按提问索引一次会话，点开整轮看工具调用与子任务，也能在项目内搜索。',
        alt: '会话页：提问索引与展开的一整轮'
      },
      {
        title: '全局搜索',
        body: '在所有项目的会话里搜你问过的话，按项目分组列出，点开一条直接回到那次提问。',
        alt: '全局搜索页：按项目分组的命中'
      }
    ]
  },
  install: {
    title: '安装',
    steps: [
      { title: '下载 DMG', body: '下载适用于 Apple Silicon 的安装包。' },
      { title: '拖进「应用程序」', body: '打开 DMG，把 Agentshed 拖到「应用程序」文件夹。' },
      {
        title: '首次打开',
        body: 'macOS 会提示「Apple 已检查，未发现恶意软件」，点「打开」即可。之后有新版本时，应用左下角会出现更新按钮。'
      }
    ]
  },
  download: {
    title: '下载',
    label: 'macOS · Apple Silicon',
    labelSub: 'macOS 12 及以上，M 系列芯片',
    list: {
      hero: '前往 GitHub 下载 Agentshed',
      line: '暂时读不到版本信息，可前往 GitHub 下载',
      button: '前往 GitHub 下载'
    },
    formal: {
      hero: '下载 Agentshed {version}',
      every: '在 GitHub 查看所有版本',
      line: '当前版本 {version}',
      download: '下载',
      github: 'GitHub'
    },
    test: {
      hero: '下载测试版 {version}',
      pill: '测试版',
      note: '正式版尚未发布。测试版从 GitHub 下载，可能还有不稳定之处。',
      line: '当前只有测试版 {version}',
      button: '从 GitHub 下载测试版'
    }
  },
  footer: { github: 'GitHub', releases: '版本发布', copyright: '© 2026 aloongplanet' }
}

const en: Dictionary = {
  nav: { features: 'Features', install: 'Install', download: 'Download', github: 'GitHub' },
  language: 'Language',
  hero: {
    title: 'Your coding agents, in full view',
    lede: 'See, across every project, which skills, plugins and MCP servers Claude Code, Codex and other coding agents have installed, what they remember and how many tokens they burned; revisit every session question by question, search what you asked across all of them, and install skills from your global library into any project.',
    platform: 'macOS 12 or later · Apple Silicon',
    shotAlt: 'The Agents overview in Agentshed'
  },
  features: {
    title: 'One app, the whole picture',
    subtitle: 'It only reads the files your coding agents leave on your Mac.',
    steps: [
      {
        title: 'The overview',
        body: 'What every coding agent has installed and how many tokens it has burned, as soon as you open it.',
        alt: 'Every agent side’s skills in one merged list'
      },
      {
        title: 'What each project has',
        body: 'Skills, subagents, plugins, MCP servers and configuration, listed as they actually take effect in that project.',
        alt: 'A project’s Skills tab'
      },
      {
        title: 'What the agents remember',
        body: 'What the agents have remembered about each project across sessions, gathered by project on one page; open a file to read it in full in a drawer.',
        alt: 'The Agents page’s Memory section, one memory file open in a drawer'
      },
      {
        title: 'Token usage and trends',
        body: 'Split by day, project and model, with history kept locally even after an agent cleans up its own sessions.',
        alt: 'A project’s token totals, trend and per-model split'
      },
      {
        title: 'Sessions, revisited',
        body: 'Each session indexed by question; open a whole turn to see its tool calls and subagents, or search within the project.',
        alt: 'The session page: the question index with one whole turn open'
      },
      {
        title: 'Search across projects',
        body: 'Find what you asked in any project’s sessions, grouped by project, and open a hit right at that question.',
        alt: 'The search page: hits grouped by project'
      }
    ]
  },
  install: {
    title: 'Install',
    steps: [
      { title: 'Download the DMG', body: 'Get the installer for Apple Silicon.' },
      { title: 'Drag to Applications', body: 'Open the DMG and drag Agentshed into your Applications folder.' },
      {
        title: 'Open it',
        body: 'macOS says “Apple checked it for malicious software and none was detected” — click Open. When a new version comes out, an update button appears at the bottom left of the app.'
      }
    ]
  },
  download: {
    title: 'Download',
    label: 'macOS · Apple Silicon',
    labelSub: 'macOS 12 or later, M-series chips',
    list: {
      hero: 'Download Agentshed from GitHub',
      line: 'Version details can’t be loaded right now — download from GitHub',
      button: 'Download from GitHub'
    },
    formal: {
      hero: 'Download Agentshed {version}',
      every: 'See every version on GitHub',
      line: 'Current version {version}',
      download: 'Download',
      github: 'GitHub'
    },
    test: {
      hero: 'Download test version {version}',
      pill: 'Test version',
      note: 'No stable release yet. The test version downloads from GitHub and may still be rough in places.',
      line: 'Only a test version so far: {version}',
      button: 'Download the test version from GitHub'
    }
  },
  footer: { github: 'GitHub', releases: 'Releases', copyright: '© 2026 aloongplanet' }
}

export const ui: Record<Locale, Dictionary> = { zh, en }
