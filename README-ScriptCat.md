# <img src="https://raw.githubusercontent.com/Lulozi/SmartEvaluation/main/A+.svg" width="42" height="42" alt="A+" /> SmartEvaluation — 智能教评助手

正方教务系统 v9.0 智能评教插件，支持一键/批量评教，兼容 Tampermonkey 和 ScriptCat。

## 安装

1. **安装脚本管理器** — 在浏览器扩展商店搜索并安装 Tampermonkey 或 ScriptCat。
2. **启用开发者模式** — 打开浏览器扩展管理页（`chrome://extensions` 或 `edge://extensions`），开启「开发者模式」。
3. **安装脚本** — 任选以下渠道之一：
   * GitHub：[https://github.com/Lulozi/SmartEvaluation](https://github.com/Lulozi/SmartEvaluation)
   * 脚本猫：[https://scriptcat.org/zh-CN/script-show-page/7196](https://scriptcat.org/zh-CN/script-show-page/7196)
   * Greasy Fork：[https://greasyfork.org/zh-CN/scripts/588832-%E6%99%BA%E8%83%BD%E6%95%99%E8%AF%84%E5%8A%A9%E6%89%8B](https://greasyfork.org/zh-CN/scripts/588832-%E6%99%BA%E8%83%BD%E6%95%99%E8%AF%84%E5%8A%A9%E6%89%8B)
4. **刷新页面** — 刷新正方教务系统评教页面，插件即自动生效。

## 使用

### 一键评价（底部按钮）

| 操作 | 效果 |
|------|------|
| 「一键评价」按钮 | 打开评优弹窗 |
| 等级按钮 | 即时全部勾选 |
| 拖动滑块 + 确认 | 按目标分逐级均降应用到页面 |
| 底部「保存」 | 保存当前教师（不跳转） |
| 底部「提交」 | 提交当前教师 → 自动跳转下一位 |

### 智能评价（顶部按钮）

| 操作 | 效果 |
|------|------|
| 「智能评价」按钮 | 打开弹窗，默认全 A |
| 设置评级 / 滑块 | 直接更新评价总分 |
| 「保存」 | 逐位自动保存所有教师 |
| 「提交」 | 逐位自动提交所有教师 |
| 「停止轮询」 | 停止当前循环 |

### 快捷键

| 按键 | 功能 |
|------|------|
| `Alt+O` | 打开弹窗 |
| `Alt+A~E` | 选择等级 |
| `Esc` | 关闭弹窗 |
| `Enter` | 确定并保存 |

## 版本

见 [CHANGELOG.log](CHANGELOG.log)

## 作者

Lulo — [GitHub](https://github.com/Lulozi/SmartEvaluation)
