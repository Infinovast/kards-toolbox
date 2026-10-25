---
name: KARDS Toolbox
description: 记录 Deck Collector 延伸界面中实际使用的视觉系统
colors:
  accent: "#8b201a"
  gold: "#c5a059"
  status-light: "#785a24"
  light-background: "#dcd7c9"
  light-panel: "#e8e4d9"
  light-input: "#f4f1ea"
  light-text: "#2f2a24"
  light-muted: "#5e574c"
  dark-background: "#0a0a0a"
  dark-panel: "#151515"
  dark-input: "#050505"
  dark-text: "#e0e0e0"
  dark-muted: "#a0a0a0"
typography:
  title:
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "28px"
  body:
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: "14px"
    lineHeight: "20px"
  label:
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: "12px"
    lineHeight: "16px"
rounded:
  control: "4px"
  base: "6px"
  panel: "9px"
spacing:
  tight: "8px"
  group: "12px"
  panel: "16px"
  page: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "8px"
  field-light:
    backgroundColor: "{colors.light-input}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: KARDS Toolbox

## Overview

本文件从 `src/index.css`、`App.tsx`、`CardLibrary.tsx` 和 `DeckBuilder.tsx` 提取现行实现。产品沿用 Deck Collector 的深浅主题、纸色背景、暗红操作色和金色选中状态；本轮扩展不引入另一套视觉风格。

界面以完成查牌、构筑和管理任务为主。图片承载卡牌内容，表单和工具栏使用紧凑的无衬线文字。

## Colors

暗红用于保存等主要操作；金色用于选中和图标强调。浅色主题中，构筑张数和规则标题使用较深的状态文字色，深色主题使用金色。

浅色面板、输入底色与正文配套使用；深色面板同样使用自己的正文与次要文字色。浅色背景可由用户设置调整，此处记录默认值。

## Typography

使用本机字体栈，不请求在线字体；Inter 不存在时使用系统字体。资料与构筑区以正文、标签、标题三级为主。数量采用等宽数字，长卡名省略但保留完整 title。

## Layout

固定侧栏上部连接“卡组”和“卡牌”，底部竖排桌布和设置，设置位于最下方；顶栏保留“关于”。构筑作为卡组编辑子页面，保存后返回列表。收藏夹通过列表内默认关闭的开关显示为可折叠分组。工作区自行滚动，外层页面不滚动。最低桌面窗口为 980×640；资料库详情栏为 260px，宽屏为 300px；构筑侧栏为 300px，宽屏为 340px。宽屏断点为 1280px。

设置占用完整工作区，顶部放卡牌数据更新，后续为外观和备份。获取、对比、应用逐步呈现；差异支持筛选、搜索和分页，以可展开表格对照当前值与候选值。保留当前主题和毛玻璃面板；操作状态使用正文提示，主操作为显式按钮。进入页面聚焦设置区域，Esc 返回来源页面并恢复侧栏焦点。

资料库网格在可用宽度增加时显示更多列。主操作保持在构筑侧栏底部，卡牌清单独立滚动。管理备注固定三行，长内容在文本框内滚动，避免挤出编辑入口。

构筑左侧筛选仅含文字搜索、构筑规则、类型、费用、稀有度、扩展包和状态；主盟国、自定义规则参数及卡组导入位于右侧滚动区，保存/复制/图片预览固定在侧栏底部。构筑卡图不带额外名称条，数量方块保留；资料库仍保留名称条。构筑与主页共用图片预览弹窗。

## Elevation & Depth

现行界面使用面板明度、细边框和悬停阴影区分层次。卡牌内容为现有图片资产；不需要通过界面装饰仿制卡面。既有收藏光晕与装饰阴影属于继承实现，不作为新增组件的默认规范。

## Shapes

基本圆角可由设置调整，默认值在前述 tokens 中。资料面板采用较大的圆角，紧凑输入和工具按钮采用控制圆角。卡图保留自己的比例，图片缺失时保持占位尺寸。

## Components

- 主按钮：暗红底、白字；次要操作使用面板底色、边框和正文色。禁用时降低透明度。
- 所有按钮在 base 层提供 160ms 悬停反馈，既有局部 hover 样式可覆盖基础规则；禁用按钮不触发。卡牌操作单独使用卡面轻微内缩及提亮，键盘焦点提供同等反馈，避免放大裁切卡面。
- 输入：使用主题输入底色、边框和内边距。文字选择采用操作色，插入光标采用金色。
- 卡牌条目：原生按钮，包含图片、卡名和简短属性；支持键盘焦点。保存的卡组按钮提供名称和选中状态。
- 导航：图标与中文短标签组合，当前模块使用操作色背景。
- 标签：小字号、面板底色和边框；添加与删除保持为显式操作。
- 焦点：现有全局焦点轮廓为金色，2px 宽并向外偏移 3px。该值是实现记录，仍需独立校验具体底色上的可见性。

## Do's and Don'ts

- Do：让新增模块复用现有主题变量和 Lucide 图标。
- Do：为卡牌缺图、空结果、导入失败和生成中状态保留可理解的文字。
- Do：维持最低桌面尺寸下保存、导出及编辑入口可达。
- Don't：把历史卡图切换展示成历史卡牌属性。
- Don't：把继承界面的装饰效果提升为所有新组件都必须使用的规则。


## 自定义选择框与悬浮详情（0.3.2）

- `CustomSelect` 统一所有选择框，沿用现有输入框配色、金色选中态、边框与毛玻璃；支持深浅主题。选项选中与键盘活动态分别可见，保留无障碍名称和多选语义。
- 阵营/类型使用图标加标签；中立为黑色白边菱形。费用为白色矩形框的 0K–7K+；稀有度只展示原站图形，文字只用于无障碍标签/悬停提示。扩展包使用原站图标及顺序，内容语言为中文时显示中文名称。
- 选择弹层 portal 到 body，固定定位，自动向上/下展开并约束在视口内，支持内部滚动；Esc 只关闭最内层，Tab 返回自然控件顺序，保留 IME。
- 卡组详情与卡牌详情同为非模态右侧悬浮层，距离工作区边缘 20px，卡组详情宽 320px。关闭按钮和 Esc 完全隐藏详情，不显示占位侧栏，不改变网格列数、内容宽度或收藏夹行宽；模态窗和内部编辑优先处理快捷键。
- 本轮按用户要求不截图、不读图；只验证 DOM、计算样式、实际交互和打包运行，视觉效果待用户确认。
