# SmartEvaluation — 智能教评助手

<p align="center"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%232da3e6'/%3E%3Ctext x='32' y='44' font-family='Arial, sans-serif' font-size='32' font-weight='bold' fill='white' text-anchor='middle'%3EA%2B%3C/text%3E%3C/svg%3E" width="64" height="64" alt="A+" /></p>

## 安装

1. **安装脚本管理器** — 在浏览器扩展商店搜索并安装 Tampermonkey 或 ScriptCat。
2. **启用开发者模式** — 打开浏览器扩展管理页（`chrome://extensions` 或 `edge://extensions`），开启「开发者模式」。
3. **安装脚本** — 任选以下渠道之一：
   * GitHub：[https://github.com/Lulozi/SmartEvaluation](https://github.com/Lulozi/SmartEvaluation)
   * 脚本猫：[https://scriptcat.org/zh-CN/script-show-page/7196](https://scriptcat.org/zh-CN/script-show-page/7196)
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
