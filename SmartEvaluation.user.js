// ==UserScript==
// @name         智能教评助手
// @name:en      SmartEvaluation
// @namespace    github.com/Lulozi
// @version      1.0.1
// @description  为正方教务系统评教页面提供智能评教功能：全选不同评级、自定义总分组合、自动跳转下一未评教师。
// @description:en  Smart evaluation assistant for Zhengfang educational system: batch rating, custom score combination, auto-navigate to next unevaluated teacher.
// @author       Lulo
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%232da3e6'/%3E%3Ctext x='32' y='44' font-family='Arial, sans-serif' font-size='32' font-weight='bold' fill='white' text-anchor='middle'%3EA%2B%3C/text%3E%3C/svg%3E
// @homepage     https://github.com/Lulozi/SmartEvaluation
// @homepageURL  https://github.com/Lulozi/SmartEvaluation
// @supportURL   https://github.com/Lulozi/SmartEvaluation/issues
// @source       https://github.com/Lulozi/SmartEvaluation
// @match        *://oaa.fitedu.net/jwglxt/xspjgl/*
// @match        *://*/jwglxt/xspjgl/*
// @include      *://*/jwglxt/xspjgl/xspj_cxXspjIndex.html*
// @grant        none
// @run-at       document-end
// @compatible   Chrome
// @compatible   Edge
// @license      MIT
// ==/UserScript==

/* globals $, jQuery */

(function () {
    'use strict';

    // 模块：常量与配置

    /**
     * 自定义分值映射表，用于弹窗总分显示和滑块计算
     * 与页面实际 data-dyf 分值解耦，独立换算
     */
    var SCORE_MAP = {
        'A': 5.625,
        'B': 5.0,
        'C': 4.375,
        'D': 3.75,
        'E': 3.125
    };

    /** 等级对应的中文标签 */
    var GRADE_LABELS = {
        'A': '优秀',
        'B': '良好',
        'C': '中等',
        'D': '及格',
        'E': '不及格'
    };

    /** 等级对应的按钮高亮颜色 */
    var GRADE_COLORS = {
        'A': '#4caf50',
        'B': '#2196f3',
        'C': '#ff9800',
        'D': '#9c27b0',
        'E': '#f44336'
    };

    /** 等级列表，按分值从高到低排列 */
    var GRADE_ORDER = ['A', 'B', 'C', 'D', 'E'];

    /** 弹窗宽度（px） */
    var DIALOG_WIDTH = 460;

    // 模块：页面适配器 —— 基于正方教务系统真实 DOM 结构精确适配

    var PageAdapter = {

        /** 缓存的题目单选框组 */
        _questionGroups: null,

        /**
         * 探测所有题目组
         * 页面结构：每道题是 <tr class="tr-xspj">，内含 5 个 <input class="radio-pjf">
         * 返回 Array<{ radios: Element[] }>，radios 按 data-dyf 从高到低排序对应 A~E
         */
        detectQuestionGroups: function () {
            if (this._questionGroups) return this._questionGroups;

            var groups = [];
            var rows = document.querySelectorAll('tr.tr-xspj');
            rows.forEach(function (row) {
                var radios = row.querySelectorAll('input.radio-pjf[type="radio"]');
                if (radios.length >= 4 && radios.length <= 6) {
                    var sorted = Array.from(radios).sort(function (a, b) {
                        var dyfA = parseInt(a.getAttribute('data-dyf')) || 0;
                        var dyfB = parseInt(b.getAttribute('data-dyf')) || 0;
                        return dyfB - dyfA;
                    });
                    groups.push({ radios: sorted });
                }
            });

            if (groups.length === 0) {
                groups = this._fallbackDetect();
            }

            this._questionGroups = groups;
            return groups;
        },

        /**
         * 回退探测策略：按 radio 的 name 属性分组
         */
        _fallbackDetect: function () {
            var groups = [];
            var allRadios = document.querySelectorAll('input.radio-pjf[type="radio"]');
            var nameMap = {};
            allRadios.forEach(function (r) {
                var n = r.getAttribute('name');
                if (!n) return;
                if (!nameMap[n]) nameMap[n] = [];
                nameMap[n].push(r);
            });
            for (var key in nameMap) {
                if (!nameMap.hasOwnProperty(key)) continue;
                var radios = nameMap[key];
                if (radios.length >= 4 && radios.length <= 6) {
                    radios.sort(function (a, b) {
                        return (parseInt(b.getAttribute('data-dyf')) || 0) - (parseInt(a.getAttribute('data-dyf')) || 0);
                    });
                    groups.push({ radios: radios });
                }
            }
            return groups;
        },

        /** 获取题目总数 */
        getQuestionCount: function () {
            return this.detectQuestionGroups().length;
        },

        /** 获取页面原生保存按钮（#btn_xspj_bc） */
        getSaveButton: function () {
            return document.getElementById('btn_xspj_bc');
        },

        /** 获取页面原生提交按钮（#btn_xspj_tj） */
        getSubmitButton: function () {
            return document.getElementById('btn_xspj_tj');
        },

        /**
         * 获取保存/提交按钮所在的工具栏容器
         * 页面结构：<div class="btn-toolbar"> 内含 <div class="btn-group">
         */
        getButtonToolbar: function () {
            var saveBtn = this.getSaveButton();
            if (saveBtn) {
                return saveBtn.closest('.btn-toolbar');
            }
            var submitBtn = this.getSubmitButton();
            if (submitBtn) {
                return submitBtn.closest('.btn-toolbar');
            }
            return null;
        },

        /**
         * 获取 jqGrid 表格对象，用于操作教师列表
         */
        getJqGrid: function () {
            try {
                if (typeof jQuery !== 'undefined') {
                    var grid = jQuery('#tempGrid');
                    if (grid.length > 0) return grid;
                }
            } catch (e) { }
            return null;
        },

        /**
         * 获取所有教师行数据
         * 从 jqGrid 读取，回退到 DOM 直接解析
         */
        getTeacherRows: function () {
            var items = [];
            try {
                if (typeof jQuery === 'undefined') return items;
                var grid = jQuery('#tempGrid');
                if (grid.length === 0) return items;

                var ids = grid.jqGrid('getDataIDs');
                if (!ids || ids.length === 0) {
                    return this._getTeacherRowsFromDOM();
                }

                ids.forEach(function (id, index) {
                    var rowData = grid.jqGrid('getRowData', id);
                    var statusCell = rowData.tjztmc || '';
                    var teacherName = rowData.jzgmc || '';
                    var courseName = rowData.kcmc || '';

                    items.push({
                        id: id,
                        rowIndex: index,
                        name: teacherName + ' - ' + courseName,
                        teacherName: teacherName,
                        courseName: courseName,
                        status: statusCell,
                        isUnrated: statusCell === '未评',
                        isSaved: statusCell === '已评完',
                        isSubmitted: statusCell === '提交'
                    });
                });
            } catch (e) {
                return this._getTeacherRowsFromDOM();
            }
            return items;
        },

        /**
         * 从 DOM 直接读取教师列表，作为 jqGrid API 失败时的回退方案
         */
        _getTeacherRowsFromDOM: function () {
            var items = [];
            var rows = document.querySelectorAll('#tempGrid tbody tr.jqgrow');
            rows.forEach(function (row, index) {
                var statusCell = row.querySelector('td[aria-describedby="tempGrid_tjztmc"]');
                var teacherCell = row.querySelector('td[aria-describedby="tempGrid_jzgmc"]');
                var courseCell = row.querySelector('td[aria-describedby="tempGrid_kcmc"]');
                var status = statusCell ? (statusCell.textContent || '').trim() : '';
                var teacher = teacherCell ? (teacherCell.textContent || '').trim() : '';
                var course = courseCell ? (courseCell.textContent || '').trim() : '';

                items.push({
                    id: row.getAttribute('id') || String(index),
                    rowIndex: index,
                    name: teacher + ' - ' + course,
                    teacherName: teacher,
                    courseName: course,
                    status: status,
                    isUnrated: status === '未评',
                    isSaved: status === '已评完',
                    isSubmitted: status === '提交'
                });
            });
            return items;
        },

        /**
         * 获取当前在 jqGrid 中选中的行索引
         * @returns {number} -1 表示未找到
         */
        getCurrentRowIndex: function () {
            try {
                if (typeof jQuery !== 'undefined') {
                    var grid = jQuery('#tempGrid');
                    if (grid.length > 0) {
                        var selId = grid.jqGrid('getGridParam', 'selrow');
                        if (selId) {
                            var ids = grid.jqGrid('getDataIDs');
                            return ids.indexOf(selId);
                        }
                    }
                }
            } catch (e) { }
            var hlRow = document.querySelector('#tempGrid tr.ui-state-highlight');
            if (hlRow) {
                var rows = document.querySelectorAll('#tempGrid tr.jqgrow');
                for (var i = 0; i < rows.length; i++) {
                    if (rows[i] === hlRow) return i;
                }
            }
            return -1;
        },

        /**
         * 查找下一个未评或已评完的教师，从当前选中行的下一行开始查找
         * 若已到末尾则从头回环查找
         */
        findNextUnevaluated: function () {
            var currentIdx = this.getCurrentRowIndex();
            var startIdx = currentIdx >= 0 ? currentIdx + 1 : 0;
            var rows = this.getTeacherRows();
            for (var i = startIdx; i < rows.length; i++) {
                if (rows[i].isUnrated || rows[i].isSaved) {
                    return rows[i];
                }
            }
            if (startIdx > 0) {
                for (var j = 0; j <= currentIdx; j++) {
                    if (rows[j].isUnrated || rows[j].isSaved) {
                        return rows[j];
                    }
                }
            }
            return null;
        },

        /**
         * 选择教师行并加载评教表单（多重回退策略）
         */
        selectTeacherRow: function (rowItem) {
            console.log('[SmartEval] 选择教师: ' + rowItem.name);
            var row = document.getElementById(rowItem.id);
            if (!row) return;

            // 尝试1：jqGrid setSelection（会触发 onSelectRow）
            try {
                if (typeof jQuery !== 'undefined') {
                    var grid = jQuery('#tempGrid');
                    if (grid.length > 0) {
                        grid.jqGrid('setSelection', rowItem.id);
                        // 额外触发 click 确保表单加载
                        setTimeout(function () {
                            row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                            if (typeof jQuery !== 'undefined') jQuery(row).trigger('click');
                        }, 100);
                        return;
                    }
                }
            } catch (e) {
                console.warn('[SmartEval] setSelection 失败', e);
            }

            // 尝试2：直接点击行
            row.click();
            row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            if (typeof jQuery !== 'undefined') jQuery(row).trigger('click');
        },

        /** 清除题目缓存，用于教师切换后重新探测 */
        clearCache: function () {
            this._questionGroups = null;
        }
    };

    // 模块：评教操作核心

    var EvalCore = {

        /**
         * 将页面所有题目设置为指定等级，即时勾选 radio 并触发 change 事件
         * @param {string} grade - 等级字母 'A'~'E'
         */
        setAllToGrade: function (grade) {
            var groups = PageAdapter.detectQuestionGroups();
            var gradeIndex = GRADE_ORDER.indexOf(grade);
            if (gradeIndex < 0) return;

            groups.forEach(function (group) {
                if (gradeIndex < group.radios.length) {
                    var radio = group.radios[gradeIndex];
                    if (radio && !radio.disabled) {
                        radio.checked = true;
                    }
                }
            });
        },

        /**
         * 计算当前页面勾选状态的总分，使用自定义 SCORE_MAP 映射
         * @returns {number}
         */
        calculateCurrentScore: function () {
            var groups = PageAdapter.detectQuestionGroups();
            var total = 0;
            groups.forEach(function (group) {
                for (var i = 0; i < group.radios.length; i++) {
                    if (group.radios[i].checked) {
                        total += SCORE_MAP[GRADE_ORDER[i]] || 0;
                        break;
                    }
                }
            });
            return total;
        },

        /**
         * 计算全选某等级时的理论总分
         */
        calculateFullGradeScore: function (grade) {
            var count = PageAdapter.getQuestionCount();
            // 回退：若无题目则从页面总分元素推断，默认16题
            if (count <= 0) {
                var sumEl = document.querySelector('.xspjSum');
                if (sumEl) {
                    var txt = (sumEl.textContent || '').replace(/[^0-9.]/g, '');
                    var total = parseFloat(txt);
                    if (total > 0) {
                        count = Math.round(total / SCORE_MAP['A']);
                    }
                }
                if (count <= 0) count = 16;
            }
            return count * (SCORE_MAP[grade] || 0);
        },

        /**
         * 获取总分范围（全 E ~ 全 A）
         */
        getScoreRange: function () {
            var count = PageAdapter.getQuestionCount();
            // 回退
            if (count <= 0) {
                var sumEl = document.querySelector('.xspjSum');
                if (sumEl) {
                    var txt = (sumEl.textContent || '').replace(/[^0-9.]/g, '');
                    var total = parseFloat(txt);
                    if (total > 0) count = Math.round(total / SCORE_MAP['A']);
                }
                if (count <= 0) count = 16;
            }
            return {
                min: count * SCORE_MAP['E'],
                max: count * SCORE_MAP['A']
            };
        },

        /**
         * 逐级均降算法：根据目标总分设置各题等级
         *
         * 算法流程：
         *   1. 初始将所有题目设为最高等级 A
         *   2. 从第一题开始逐题降级（A→B→C→D→E）
         *   3. 全部题目降到同一级后，再从第一题开始降下一级
         *   4. 每降一级检查总分，直到总分不超过目标分数
         *
         * @param {number} targetScore - 目标总分
         */
        applyScoreWithDescendingGrade: function (targetScore) {
            var groups = PageAdapter.detectQuestionGroups();
            var count = groups.length;
            if (count === 0) return;

            var grades = new Array(count).fill('A');
            var currentScore = count * SCORE_MAP['A'];

            if (targetScore >= currentScore) {
                this._applyGradesToPage(groups, grades);
                return;
            }
            var minScore = count * SCORE_MAP['E'];
            if (targetScore <= minScore) {
                this._applyGradesToPage(groups, new Array(count).fill('E'));
                return;
            }

            // 从第一题开始，逐级均降：全部题降完一级才降下一级
            var level = 0; // 当前降级偏移（0=A, 1=B, ..., 4=E）
            while (currentScore > targetScore && level < GRADE_ORDER.length - 1) {
                for (var i = 0; i < count && currentScore > targetScore; i++) {
                    var curGrade = grades[i];
                    var curGradeIdx = GRADE_ORDER.indexOf(curGrade);
                    if (curGradeIdx !== level) continue; // 尚未轮到该题降级

                    var nextGrade = GRADE_ORDER[curGradeIdx + 1];
                    var diff = SCORE_MAP[curGrade] - SCORE_MAP[nextGrade];
                    var newScore = currentScore - diff;
                    if (newScore >= targetScore) {
                        grades[i] = nextGrade;
                        currentScore = newScore;
                    } else {
                        // 降级后会低于目标，跳过此题，尝试下一题
                        continue;
                    }
                }
                level++; // 当前级别全部处理完，进入下一级
            }

            this._applyGradesToPage(groups, grades);
        },

        /**
         * 将等级数组应用到页面 radio 按钮
         */
        _applyGradesToPage: function (groups, grades) {
            for (var i = 0; i < groups.length && i < grades.length; i++) {
                var gradeIdx = GRADE_ORDER.indexOf(grades[i]);
                if (gradeIdx >= 0 && gradeIdx < groups[i].radios.length) {
                    var radio = groups[i].radios[gradeIdx];
                    if (radio && !radio.disabled) {
                        radio.checked = true;
                    }
                }
            }
        }
    };

    // 模块：弹窗 UI

    var DialogUI = {

        _overlay: null,
        _scoreDisplay: null,
        _slider: null,
        _sliderPreview: null,
        _currentGrade: null,
        _pendingSliderScore: null,
        _smartMode: false,

        /**
         * 创建并显示弹窗
         */
        show: function (smartMode) {
            if (this._overlay) this._overlay.remove();

            var self = this;
            self._smartMode = !!smartMode;
            self._currentGrade = null;
            // 智能模式默认总分为全A
            var count = PageAdapter.getQuestionCount();
            var range = EvalCore.getScoreRange();
            // 智能模式默认全A，普通模式读取页面实际值
            var initScore = self._smartMode ? range.max : EvalCore.calculateCurrentScore();
            self._pendingSliderScore = self._smartMode ? range.max : null;

            // 遮罩层
            var overlay = document.createElement('div');
            overlay.className = 'SmartEval-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;'
                + 'background:rgba(0,0,0,0.45);z-index:99999;'
                + 'display:flex;align-items:center;justify-content:center;';

            // 弹窗主体
            var dialog = document.createElement('div');
            dialog.className = 'SmartEval-dialog';
            dialog.style.cssText = 'width:' + DIALOG_WIDTH + 'px;background:#fff;border-radius:10px;'
                + 'box-shadow:0 8px 32px rgba(0,0,0,0.3);overflow:hidden;'
                + 'font-family:"Microsoft YaHei","PingFang SC","Helvetica Neue",Arial,sans-serif;'
                + 'font-size:14px;color:#333;';

            // 注入动画样式（仅一次）
            if (!document.getElementById('SmartEval-keyframes')) {
                var styleEl = document.createElement('style');
                styleEl.id = 'SmartEval-keyframes';
                styleEl.textContent = '@keyframes easyaceIn{'
                    + 'from{opacity:0;transform:translateY(-15px);}'
                    + 'to{opacity:1;transform:translateY(0);}}';
                document.head.appendChild(styleEl);
            }
            dialog.style.animation = 'easyaceIn 0.2s ease-out';

            // 标题栏
            var titleBar = document.createElement('div');
            titleBar.style.cssText = 'padding:16px 20px;background:#1a73e8;color:#fff;'
                + 'font-size:17px;font-weight:bold;display:flex;justify-content:space-between;align-items:center;';
            var titleText = document.createElement('span');
            titleText.textContent = '智能教评助手';
            var closeSpan = document.createElement('span');
            closeSpan.className = 'SmartEval-close';
            closeSpan.textContent = '\u2715';
            closeSpan.style.cssText = 'cursor:pointer;font-size:22px;line-height:1;opacity:0.8;';
            titleBar.appendChild(titleText);
            titleBar.appendChild(closeSpan);
            dialog.appendChild(titleBar);

            // 内容区
            var content = document.createElement('div');
            content.style.cssText = 'padding:20px;';

            // 教师统计信息行
            var teacherRows = PageAdapter.getTeacherRows();
            var totalTeachers = teacherRows.length;
            var unratedCount = teacherRows.filter(function (r) { return r.isUnrated; }).length;
            var savedCount = teacherRows.filter(function (r) { return r.isSaved; }).length;
            var submittedCount = teacherRows.filter(function (r) { return r.isSubmitted; }).length;

            var infoRow = document.createElement('div');
            infoRow.style.cssText = 'margin-bottom:16px;padding:10px 14px;background:#f0f7ff;'
                + 'border-radius:6px;font-size:13px;color:#1a73e8;border:1px solid #d0e3ff;line-height:1.8;';
            infoRow.innerHTML = '检测到一共 <b>' + totalTeachers + '</b> 位教师<br>'
                + '未评完: <b style="color:red">' + unratedCount + '</b> 位 '
                + '已评完: <b style="color:blue">' + savedCount + '</b> 位 '
                + '提交: <b style="color:green">' + submittedCount + '</b> 位';

            // 等级按钮区
            var btnSection = document.createElement('div');
            btnSection.style.cssText = 'margin-bottom:18px;';

            var btnLabel = document.createElement('div');
            btnLabel.textContent = self._smartMode ? '设置评级' : '快速评级（即时生效）';
            btnLabel.style.cssText = 'font-size:13px;font-weight:bold;color:#555;margin-bottom:10px;';
            btnSection.appendChild(btnLabel);

            var btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

            GRADE_ORDER.forEach(function (grade) {
                var btn = document.createElement('button');
                btn.textContent = GRADE_LABELS[grade];
                btn.setAttribute('data-grade', grade);
                btn.style.cssText = 'flex:1;min-width:60px;padding:10px 6px;border:2px solid #ddd;'
                    + 'border-radius:8px;background:#fff;cursor:pointer;font-size:14px;'
                    + 'font-weight:600;color:#444;transition:all 0.2s;';

                btn.addEventListener('mouseenter', function () {
                    if (self._currentGrade !== grade) {
                        btn.style.borderColor = GRADE_COLORS[grade];
                        btn.style.color = GRADE_COLORS[grade];
                        btn.style.background = '#fafafa';
                    }
                });
                btn.addEventListener('mouseleave', function () {
                    if (self._currentGrade !== grade) {
                        btn.style.borderColor = '#ddd';
                        btn.style.color = '#444';
                        btn.style.background = '#fff';
                    }
                });
                btn.addEventListener('click', function () { self.selectGrade(grade); });
                btnRow.appendChild(btn);
            });

            btnSection.appendChild(btnRow);
            content.appendChild(btnSection);

            // 当前总分显示（始终读取页面实际值，不受滑块影响）
            var scoreDisplay = document.createElement('div');
            scoreDisplay.style.cssText = 'text-align:center;padding:14px;margin-bottom:18px;'
                + 'background:#fafafa;border-radius:8px;border:1px solid #e8e8e8;';

            var scoreLabel = document.createElement('div');
            scoreLabel.textContent = self._smartMode ? '评价总分' : '当前总分';
            scoreLabel.style.cssText = 'font-size:12px;color:#999;margin-bottom:4px;';

            var scoreValue = document.createElement('div');
            scoreValue.className = 'SmartEval-score-value';
            scoreValue.style.cssText = 'font-size:36px;font-weight:bold;color:#1a73e8;transition:color 0.3s;';
            scoreValue.textContent = initScore.toFixed(2);

            scoreDisplay.appendChild(scoreLabel);
            scoreDisplay.appendChild(scoreValue);
            content.appendChild(scoreDisplay);
            self._scoreDisplay = scoreValue;

            // 自定义总分滑块区
            var sliderSection = document.createElement('div');
            sliderSection.style.cssText = 'margin-bottom:20px;';

            // 滑块标题行
            var sliderTitleRow = document.createElement('div');
            sliderTitleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';

            var sliderLabel = document.createElement('span');
            sliderLabel.textContent = self._smartMode ? '自定义总分' : '自定义总分（拖动预览，确定后生效）';
            sliderLabel.style.cssText = 'font-size:13px;font-weight:bold;color:#555;';

            sliderTitleRow.appendChild(sliderLabel);

            // 普通模式：标题行右侧显示预览分数
            var sliderPreview = null;
            if (!self._smartMode) {
                sliderPreview = document.createElement('span');
                sliderPreview.className = 'SmartEval-slider-preview';
                sliderPreview.textContent = initScore.toFixed(2);
                sliderPreview.style.cssText = 'font-size:16px;font-weight:bold;color:#ff9800;';
                sliderTitleRow.appendChild(sliderPreview);
            }
            sliderSection.appendChild(sliderTitleRow);
            self._sliderPreview = sliderPreview;

            // 滑块行
            var sliderRow = document.createElement('div');
            sliderRow.style.cssText = 'display:flex;align-items:center;gap:12px;';

            var slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'SmartEval-slider';
            slider.style.cssText = 'flex:1;height:6px;cursor:pointer;accent-color:#1a73e8;';
            var STEP = 0.625;
            slider.min = Math.floor(range.min * 100) / 100;
            slider.max = Math.ceil(range.max * 100) / 100;
            slider.step = STEP;
            slider.value = Math.round(initScore / STEP) * STEP;

            if (self._smartMode) {
                // 智能模式：滑块直接更新评价总分
                slider.addEventListener('input', function () {
                    var val = Math.round(parseFloat(slider.value) / STEP) * STEP;
                    val = Math.max(range.min, Math.min(range.max, val));
                    self._scoreDisplay.textContent = val.toFixed(2);
                    self._pendingSliderScore = val;
                });
            } else {
                // 普通模式：确认按钮
                var btnSliderConfirm = document.createElement('button');
                btnSliderConfirm.textContent = '确认';
                btnSliderConfirm.style.cssText = 'padding:8px 16px;border:none;border-radius:6px;'
                    + 'background:#1a73e8;color:#fff;cursor:pointer;font-size:13px;font-weight:bold;'
                    + 'white-space:nowrap;transition:all 0.2s;';

                slider.addEventListener('input', function () {
                    var raw = parseFloat(slider.value);
                    var val = Math.round(raw / STEP) * STEP;
                    val = Math.max(range.min, Math.min(range.max, val));
                    if (self._sliderPreview) self._sliderPreview.textContent = val.toFixed(3);
                    self._pendingSliderScore = val;
                });

                btnSliderConfirm.addEventListener('click', function () {
                    if (self._pendingSliderScore !== null) {
                        EvalCore.applyScoreWithDescendingGrade(self._pendingSliderScore);
                        var actualScore = EvalCore.calculateCurrentScore();
                        self._scoreDisplay.textContent = actualScore.toFixed(2);
                        self._scoreDisplay.style.color = '#1a73e8';
                        if (self._sliderPreview) self._sliderPreview.textContent = actualScore.toFixed(2);
                    }
                });
                btnSliderConfirm.addEventListener('mouseenter', function () {
                    btnSliderConfirm.style.background = '#1557b0';
                });
                btnSliderConfirm.addEventListener('mouseleave', function () {
                    btnSliderConfirm.style.background = '#1a73e8';
                });
                sliderRow.appendChild(btnSliderConfirm);
            }

            sliderRow.insertBefore(slider, sliderRow.firstChild);
            sliderSection.appendChild(sliderRow);
            content.appendChild(sliderSection);

            self._slider = slider;

            // 底部操作按钮：取消 / 确定（保存） / 提交
            var footer = document.createElement('div');
            footer.style.cssText = 'display:flex;gap:10px;padding:16px 20px;'
                + 'border-top:1px solid #eee;background:#fafafa;';

            var btnCancel = document.createElement('button');
            btnCancel.textContent = '取消';
            btnCancel.style.cssText = 'flex:1;padding:10px;border:1px solid #ddd;border-radius:6px;'
                + 'background:#fff;cursor:pointer;font-size:14px;color:#666;transition:all 0.2s;';

            var btnConfirm = document.createElement('button');
            btnConfirm.textContent = '保存';
            btnConfirm.style.cssText = 'flex:1;padding:10px;border:none;border-radius:6px;'
                + 'background:#1a73e8;cursor:pointer;font-size:14px;font-weight:bold;'
                + 'color:#fff;transition:all 0.2s;';

            var btnSubmit = document.createElement('button');
            btnSubmit.textContent = '提交';
            btnSubmit.style.cssText = 'flex:1;padding:10px;border:none;border-radius:6px;'
                + 'background:#4caf50;cursor:pointer;font-size:14px;font-weight:bold;'
                + 'color:#fff;transition:all 0.2s;';

            footer.appendChild(btnCancel);
            footer.appendChild(btnConfirm);
            footer.appendChild(btnSubmit);

            dialog.appendChild(content);
            dialog.appendChild(footer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            self._overlay = overlay;

            // 事件绑定

            var closeBtn = dialog.querySelector('.SmartEval-close');
            closeBtn.addEventListener('click', function () { self.hide(); });
            closeBtn.addEventListener('mouseenter', function () { closeBtn.style.opacity = '1'; });
            closeBtn.addEventListener('mouseleave', function () { closeBtn.style.opacity = '0.8'; });

            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) self.hide();
            });

            btnCancel.addEventListener('click', function () { self.hide(); });
            btnCancel.addEventListener('mouseenter', function () {
                btnCancel.style.background = '#f0f0f0';
                btnCancel.style.borderColor = '#bbb';
            });
            btnCancel.addEventListener('mouseleave', function () {
                btnCancel.style.background = '#fff';
                btnCancel.style.borderColor = '#ddd';
            });

            // 确定按钮：先应用滑块分值（如有），再触发原生保存
            btnConfirm.addEventListener('click', function () { self.applyAndSave(); });
            btnConfirm.addEventListener('mouseenter', function () {
                btnConfirm.style.background = '#1557b0';
            });
            btnConfirm.addEventListener('mouseleave', function () {
                btnConfirm.style.background = '#1a73e8';
            });

            // 提交按钮：先应用滑块分值（如有），再触发原生提交
            btnSubmit.addEventListener('click', function () { self.applyAndSubmit(); });
            btnSubmit.addEventListener('mouseenter', function () {
                btnSubmit.style.background = '#388e3c';
            });
            btnSubmit.addEventListener('mouseleave', function () {
                btnSubmit.style.background = '#4caf50';
            });
            // 智能模式默认选择优秀
            if (self._smartMode) {
                self.selectGrade('A');
            }
        },

        /** 隐藏弹窗 */
        hide: function () {
            if (this._overlay) {
                this._overlay.remove();
                this._overlay = null;
            }
        },

        /**
         * 选择等级按钮，即时生效：勾选页面 radio 并更新弹窗总分和滑块
         */
        selectGrade: function (grade) {
            var self = this;
            var allBtns = self._overlay.querySelectorAll('[data-grade]');
            allBtns.forEach(function (b) {
                b.style.borderColor = '#ddd';
                b.style.color = '#444';
                b.style.background = '#fff';
                b.style.boxShadow = 'none';
            });
            var activeBtn = self._overlay.querySelector('[data-grade="' + grade + '"]');
            if (activeBtn) {
                activeBtn.style.borderColor = GRADE_COLORS[grade];
                activeBtn.style.color = '#fff';
                activeBtn.style.background = GRADE_COLORS[grade];
                activeBtn.style.boxShadow = '0 2px 8px ' + GRADE_COLORS[grade] + '80';
            }

            self._currentGrade = grade;

            if (self._smartMode) {
                // 智能模式：不操作页面，仅更新显示
                var score = EvalCore.calculateFullGradeScore(grade);
                self._scoreDisplay.textContent = score.toFixed(2);
                self._scoreDisplay.style.color = '#1a73e8';
                self._pendingSliderScore = score;
                if (self._slider) {
                    self._slider.value = score;
                }
            } else {
                // 普通模式：即时应用到页面
                EvalCore.setAllToGrade(grade);
                var score = EvalCore.calculateCurrentScore();
                self._scoreDisplay.textContent = score.toFixed(2);
                self._scoreDisplay.style.color = '#1a73e8';
                self._pendingSliderScore = score;
                if (self._slider) {
                    self._slider.value = score;
                    if (self._sliderPreview) self._sliderPreview.textContent = score.toFixed(2);
                }
            }
        },

        /**
         * 应用滑块分值到页面（如有改动），然后触发原生保存并接管成功提示
         */
        applyAndSave: function () {
            if (this._pendingSliderScore !== null) {
                EvalCore.applyScoreWithDescendingGrade(this._pendingSliderScore);
            }
            this.hide();
            PageAdapter.clearCache();
            if (this._smartMode) {
                AutoFlow.startAutoSave();
            } else {
                AutoFlow.triggerSaveOnly();
            }
        },

        /**
         * 提交：智能模式逐位循环，普通模式单次
         */
        applyAndSubmit: function () {
            if (this._pendingSliderScore !== null) {
                EvalCore.applyScoreWithDescendingGrade(this._pendingSliderScore);
            }
            this.hide();
            PageAdapter.clearCache();
            if (this._smartMode) {
                AutoFlow.startAutoSubmit();
            } else {
                AutoFlow.triggerSubmitAndJump();
            }
        }
    };

    // 模块：自动流程 —— 仅当插件触发保存/提交时接管成功提示并自动跳转

    var AutoFlow = {

        _interceptActive: false,
        _alertObserver: null,
        _jumpTimeout: null,
        _jumpDelay: null,
        _origAlert: null,
        _successFired: false,

        /**
         * 接管页面的成功提示弹窗（仅插件触发保存/提交时调用）
         * 支持三种弹窗：原生 alert、jqGrid alert（#alertmod_tempGrid）、bootbox
         */
        interceptAndJump: function () {
            if (this._interceptActive) return;
            this._interceptActive = true;
            this._successFired = false;

            var self = this;
            self._origAlert = window.alert;

            // 策略1：拦截原生 alert，仅自动关闭成功提示，警告/错误保留
            window.alert = function (msg) {
                var isSuccess = /成功|保存成功|提交成功|评价成功/.test(msg || '');
                var isAntiInjection = /脚本注入|自动评价/.test(msg || '');
                try {
                    if (!isAntiInjection) {
                        self._origAlert.call(window, msg);
                    } else {
                        console.log('[SmartEval] 反注入警告已拦截');
                    }
                } finally {
                    window.alert = self._origAlert;
                    self._cleanup();
                    if (isSuccess) {
                        console.log('[SmartEval] 检测到成功提示，自动跳转');
                        self._onSuccess();
                    } else if (isAntiInjection) {
                        console.log('[SmartEval] 反注入警告，不跳转');
                    } else {
                        console.log('[SmartEval] 非成功提示: ' + (msg || '').substring(0, 50));
                    }
                }
            };

            // 策略2/3：监听 DOM 变化检测弹窗
            this._alertObserver = new MutationObserver(function () {
                // jqGrid alert 弹窗
                var alertBox = document.getElementById('alertmod_tempGrid');
                if (alertBox && alertBox.style.display !== 'none' && self._isVisible(alertBox)) {
                    var content = alertBox.querySelector('.ui-jqdialog-content');
                    var msgText = content ? (content.textContent || '') : '';
                    var isSuccess = /成功|保存成功|提交成功|评价成功/.test(msgText);
                    console.log('[SmartEval] 检测到 jqGrid 弹窗: ' + msgText.substring(0, 50));
                    if (isSuccess) {
                        var closeBtn = alertBox.querySelector('.ui-jqdialog-titlebar-close');
                        if (closeBtn) closeBtn.click();
                        self._cleanup();
                        console.log('[SmartEval] 成功弹窗已关闭，准备跳转');
                        self._onSuccess();
                    } else {
                        // 非成功提示，断开观察，保留弹窗
                        self._cleanup();
                        console.log('[SmartEval] 非成功弹窗，保留');
                    }
                    return;
                }

                // bootbox 弹窗：通过标题文字判断类型
                var bootboxModals = document.querySelectorAll('.bootbox.modal');
                bootboxModals.forEach(function (modal) {
                    if (self._isVisible(modal) && !modal._easyaceHandled) {
                        modal._easyaceHandled = true;
                        var titleEl = modal.querySelector('.modal-title');
                        var titleText = titleEl ? (titleEl.textContent || '').trim() : '';
                        console.log('[SmartEval] 检测到 bootbox 弹窗: ' + titleText);

                        if (titleText === '成功提示') {
                            var okBtn = modal.querySelector('.modal-footer .btn-primary') || modal.querySelector('.modal-footer .btn-default');
                            if (okBtn) okBtn.click();
                            self._cleanup();
                            console.log('[SmartEval] 成功弹窗已关闭，准备跳转');
                            self._onSuccess();
                        } else if (titleText === '警告提示' || titleText === '警告信息') {
                            // 警告弹窗：自动点击确定，不跳转
                            var confirmBtn = modal.querySelector('.modal-footer .btn-primary') || modal.querySelector('.modal-footer .btn-default');
                            if (confirmBtn) confirmBtn.click();
                            self._cleanup();
                            console.log('[SmartEval] 警告弹窗已关闭，不跳转');
                        } else {
                            self._cleanup();
                            console.log('[SmartEval] 其他弹窗，保留');
                        }
                    }
                });
            });

            this._alertObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class']
            });

            // 超时兜底
            this._jumpTimeout = setTimeout(function () {
                self._cleanup();
                self._onSuccess();
            }, 10000);
        },

        /** 清理拦截状态 */
        _cleanup: function () {
            if (this._alertObserver) {
                this._alertObserver.disconnect();
                this._alertObserver = null;
            }
            if (this._jumpTimeout) {
                clearTimeout(this._jumpTimeout);
                this._jumpTimeout = null;
            }
            if (this._jumpDelay) {
                clearTimeout(this._jumpDelay);
                this._jumpDelay = null;
            }
            this._interceptActive = false;
            if (window.alert !== this._origAlert) {
                window.alert = this._origAlert;
            }
        },

        /** 判断元素是否可见 */
        _isVisible: function (el) {
            if (!el) return false;
            var style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        },

        /**
         * 成功提示关闭后的回调：等待页面刷新完成后跳转下一位教师
         */
        _onSuccess: function () {
            if (this._successFired) return;
            this._successFired = true;

            var self = this;
            if (self._jumpDelay) clearTimeout(self._jumpDelay);

            // 等待 1.5 秒确保页面局部刷新（jqGrid 重载）完成
            self._jumpDelay = setTimeout(function () {
                console.log('[SmartEval] 页面刷新等待完成，查找下一位教师...');
                // 输出当前评价的实际分数和状态
                var score = EvalCore.calculateCurrentScore();
                var rows = PageAdapter.getTeacherRows();
                var currentIdx = PageAdapter.getCurrentRowIndex();
                var statusText = (currentIdx >= 0 && rows[currentIdx]) ? rows[currentIdx].status : '未知';
                console.log('[SmartEval] 本次评分: ' + score.toFixed(3) + ' / 状态: ' + statusText);
                var next = PageAdapter.findNextUnevaluated();
                if (next) {
                    console.log('[SmartEval] 自动跳转至: ' + next.teacherName + ' - ' + next.courseName);
                    PageAdapter.selectTeacherRow(next);
                    setTimeout(function () {
                        PageAdapter.clearCache();
                    }, 800);
                } else {
                    console.log('[SmartEval] 所有教师已评价完毕');
                }
                self._jumpDelay = null;
            }, 1500);
        },

        /**
         * 按可见文字查找按钮（参考已成功运行的脚本方案）
         */
        _findVisibleBtn: function (text) {
            var btns = document.querySelectorAll('button, input[type="button"]');
            for (var i = 0; i < btns.length; i++) {
                var t = (btns[i].textContent || '').trim();
                if (t === text && btns[i].offsetParent !== null) {
                    return btns[i];
                }
            }
            return null;
        },

        /**
         * 模拟真实点击的事件序列（参考已成功运行的脚本方案）
         */
        _safeClick: function (btn) {
            if (!btn) return;
            btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            var self = this;
            setTimeout(function () {
                btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                // 同时用 jQuery 触发
                if (typeof jQuery !== 'undefined') {
                    jQuery(btn).trigger('click');
                }
            }, 80);
        },

        /** 触发保存：仅保存不跳转（普通模式） */
        triggerSaveOnly: function () {
            var self = this;
            setTimeout(function () {
                var btn = PageAdapter.getSaveButton() || self._findVisibleBtn('保存');
                if (btn) {
                    console.log('[SmartEval] 保存（不跳转）');
                    self._safeClick(btn);
                }
            }, 100);
        },

        /** 触发保存：保存并接管弹窗跳转（智能模式单次用） */
        triggerSaveAndJump: function () {
            this.interceptAndJump();
            var self = this;
            setTimeout(function () {
                var btn = PageAdapter.getSaveButton() || self._findVisibleBtn('保存');
                if (btn) {
                    console.log('[SmartEval] 模拟点击保存按钮');
                    self._safeClick(btn);
                } else {
                    console.warn('[SmartEval] 未找到保存按钮');
                    self._cleanup();
                }
            }, 100);
        },

        /** 触发提交：模拟点击页面提交按钮 */
        triggerSubmitAndJump: function () {
            this.interceptAndJump();
            var self = this;
            setTimeout(function () {
                var btn = PageAdapter.getSubmitButton() || self._findVisibleBtn('提交');
                if (btn) {
                    console.log('[SmartEval] 模拟点击提交按钮');
                    self._safeClick(btn);
                } else {
                    console.warn('[SmartEval] 未找到提交按钮');
                    self._cleanup();
                }
            }, 100);
        },

        /**
         * 弹出循环完成总结弹窗
         * @param {string} mode - 'save' 或 'submit'
         * @param {Array} results - [{name, course, score}] 
         */
        _showSummary: function (mode, results) {
            var title = mode === 'save' ? '保存完毕' : '提交完毕';
            var html = '<div style="max-height:400px;overflow-y:auto;"><b>' + title + '，共 ' + results.length + ' 位教师：</b><br><br>';
            for (var i = 0; i < results.length; i++) {
                html += (i + 1) + '. ' + results[i].name + ' - ' + results[i].course + ' <b>' + results[i].score.toFixed(2) + '</b><br>';
            }
            html += '</div>';
            if (typeof bootbox !== 'undefined' && bootbox.alert) {
                bootbox.alert({ title: title, message: html, size: 'small' });
            } else {
                alert(title + '\n' + results.length + ' 位教师已完成');
            }
        },
        startAutoSave: function () {
            var self = this;
            console.log('[SmartEval] 开始自动逐位保存...');
            try { window.sessionStorage.setItem('__easyace_loop__', '1'); } catch (e) { }
            var origOnSuccess = self._onSuccess;
            var active = true;
            var results = [];
            var processedIds = {};
            var maxIter = 50;

            // 获取对话框中用户设定的目标分，默认全A
            var targetScore = DialogUI._pendingSliderScore;
            if (targetScore === null || targetScore === undefined) {
                targetScore = PageAdapter.getQuestionCount() * SCORE_MAP['A'];
            }

            // 使用页头停止按钮
            var stopBtn = document.getElementById('SmartEval-stop-btn');
            if (stopBtn) stopBtn.style.display = '';
            window._easyaceStopCallback = function () {
                active = false;
                console.log('[SmartEval] 用户手动停止轮询');
                try { window.sessionStorage.removeItem('__easyace_loop__'); } catch (e) { }
                self._onSuccess = origOnSuccess;
                if (stopBtn) stopBtn.style.display = 'none';
            };

            function next() {
                if (!active) { if (stopBtn) stopBtn.style.display = 'none'; return; }
                // 刷新 jqGrid 获取最新状态
                try { if (typeof jQuery !== 'undefined') jQuery('#tempGrid').trigger('reloadGrid'); } catch (e) { }
                PageAdapter.clearCache();
                var t = PageAdapter.findNextUnevaluated();
                if (!t || processedIds[t.id] || maxIter-- <= 0) {
                    console.log('[SmartEval] 保存完毕');
                    active = false;
                    try { window.sessionStorage.removeItem('__easyace_loop__'); } catch (e) { }
                    self._onSuccess = origOnSuccess;
                    if (stopBtn) stopBtn.style.display = 'none';
                    self._showSummary('save', results);
                    return;
                }
                console.log('[SmartEval] 自动保存: ' + t.teacherName);
                processedIds[t.id] = true;
                PageAdapter.selectTeacherRow(t);
                // 等待表单加载完成后再评分保存
                self._onSuccess = function () {
                    if (!active) return;
                    var s = EvalCore.calculateCurrentScore();
                    results.push({ name: t.teacherName, course: t.courseName, score: s });
                    setTimeout(function () { PageAdapter.clearCache(); next(); }, 2000);
                };
                setTimeout(function () {
                    PageAdapter.clearCache();
                    EvalCore.applyScoreWithDescendingGrade(targetScore);
                    setTimeout(function () {
                        self.interceptAndJump();
                        var b = PageAdapter.getSaveButton() || self._findVisibleBtn('保存');
                        if (b) self._safeClick(b);
                    }, 800);
                }, 1200);
            }
            next();
        },

        /**
         * 自动逐位提交：用 findNextUnevaluated 跳过已处理、已提交的教师
         */
        startAutoSubmit: function () {
            var self = this;
            console.log('[SmartEval] 开始自动逐位提交...');
            try { window.sessionStorage.setItem('__easyace_loop__', '1'); } catch (e) { }
            var origOnSuccess = self._onSuccess;
            var active = true;
            var results = [];
            var processedIds = {}; // 提交模式防重复

            var targetScore = DialogUI._pendingSliderScore;
            if (targetScore === null || targetScore === undefined) {
                targetScore = PageAdapter.getQuestionCount() * SCORE_MAP['A'];
            }

            // 使用页头停止按钮
            var stopBtn2 = document.getElementById('SmartEval-stop-btn');
            if (stopBtn2) stopBtn2.style.display = '';
            window._easyaceStopCallback = function () {
                active = false;
                console.log('[SmartEval] 用户手动停止轮询');
                try { window.sessionStorage.removeItem('__easyace_loop__'); } catch (e) { }
                self._onSuccess = origOnSuccess;
                if (stopBtn2) stopBtn2.style.display = 'none';
            };

            function next() {
                if (!active) { if (stopBtn2) stopBtn2.style.display = 'none'; return; }
                try { if (typeof jQuery !== 'undefined') jQuery('#tempGrid').trigger('reloadGrid'); } catch (e) { }
                PageAdapter.clearCache();
                var t = PageAdapter.findNextUnevaluated();
                if (!t || processedIds[t.id]) {
                    console.log('[SmartEval] 提交完毕');
                    active = false;
                    try { window.sessionStorage.removeItem('__easyace_loop__'); } catch (e) { }
                    self._onSuccess = origOnSuccess;
                    if (stopBtn2) stopBtn2.style.display = 'none';
                    self._showSummary('submit', results);
                    return;
                }
                console.log('[SmartEval] 自动提交: ' + t.teacherName);
                processedIds[t.id] = true;
                PageAdapter.selectTeacherRow(t);
                // 等待表单加载
                self._onSuccess = function () {
                    if (!active) return;
                    var s = EvalCore.calculateCurrentScore();
                    results.push({ name: t.teacherName, course: t.courseName, score: s });
                    setTimeout(function () { PageAdapter.clearCache(); next(); }, 2000);
                };
                setTimeout(function () {
                    PageAdapter.clearCache();
                    EvalCore.applyScoreWithDescendingGrade(targetScore);
                    setTimeout(function () {
                        self.interceptAndJump();
                        var b = PageAdapter.getSubmitButton() || self._findVisibleBtn('提交');
                        if (b) self._safeClick(b);
                    }, 800);
                }, 1200);
            }
            next();
        }
    };

    // 模块：注入一键评优按钮到页面（独立按钮，与保存/提交同行但不放入同一 btn-group）

    function injectButton() {
        if (document.getElementById('SmartEval-main-btn')) return;

        var toolbar = PageAdapter.getButtonToolbar();
        if (!toolbar) {
            setTimeout(injectButton, 500);
            return;
        }

        var btn = document.createElement('button');
        btn.id = 'SmartEval-main-btn';
        btn.type = 'button';
        btn.className = 'btn btn-primary';
        btn.textContent = '一键评价';
        btn.style.cssText = 'margin-left:15px;';
        btn.title = '打开智能教评助手 (Alt+O)';

        btn.addEventListener('click', function () {
            PageAdapter.clearCache();
            DialogUI.show();
        });

        // 作为 btn-toolbar 的直接子元素，与 btn-group 并列
        toolbar.appendChild(btn);
    }

    // 模块：初始化完成后跳转一次教师（不轮询等待）

    function tryAutoJumpOnce() {
        try {
            if (window.sessionStorage.getItem('__easyace_loop__') === '1') return;
        } catch (e) { }

        var attempts = 0;
        function doJump() {
            var rows = PageAdapter.getTeacherRows();
            if (rows.length === 0) {
                if (++attempts <= 2) {
                    console.log('[SmartEval] 教师列表未就绪，500ms后重试...');
                    setTimeout(doJump, 500);
                } else {
                    console.log('[SmartEval] 教师列表为空，跳过自动跳转');
                }
                return;
            }
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].isUnrated || rows[i].isSaved) {
                    console.log('[SmartEval] 自动跳转至: ' + rows[i].teacherName + ' - ' + rows[i].courseName);
                    PageAdapter.selectTeacherRow(rows[i]);
                    setTimeout(function () { PageAdapter.clearCache(); }, 1000);
                    return;
                }
            }
            console.log('[SmartEval] 所有教师已提交，无需跳转');
        }
        doJump();
    }

    // 模块：监听评教表单变化，教师切换后重新注入按钮

    function watchTeacherChange() {
        // 使用 MutationObserver 监听 #panel_content 的变化（表单加载位置）
        var panelContent = document.getElementById('panel_content');
        if (panelContent) {
            var observer = new MutationObserver(function () {
                // 延迟检查，等待新表单渲染完成
                setTimeout(function () {
                    if (!document.getElementById('SmartEval-main-btn')) {
                        injectButton();
                    }
                }, 300);
            });
            observer.observe(panelContent, { childList: true, subtree: false });
        }

        // 兜底轮询检查
        setInterval(function () {
            if (!document.getElementById('SmartEval-main-btn')) {
                injectButton();
            }
        }, 2000);
    }

    // 模块：键盘快捷键

    function registerShortcuts() {
        document.addEventListener('keydown', function (e) {
            // Alt+O 打开弹窗
            if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'o') {
                e.preventDefault();
                PageAdapter.clearCache();
                DialogUI.show();
                return;
            }

            if (DialogUI._overlay) {
                // Alt+A~E 选择等级
                if (e.altKey && !e.ctrlKey && !e.metaKey) {
                    var map = { 'a': 'A', 'b': 'B', 'c': 'C', 'd': 'D', 'e': 'E' };
                    var grade = map[e.key.toLowerCase()];
                    if (grade) {
                        e.preventDefault();
                        DialogUI.selectGrade(grade);
                    }
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    DialogUI.hide();
                }
                if (e.key === 'Enter' && !e.altKey) {
                    e.preventDefault();
                    DialogUI.applyAndSave();
                }
            }
        });
    }

    // 模块：页头顶部注入"智能评价"按钮和"停止轮询"按钮

    function injectHeaderButton() {
        if (document.getElementById('SmartEval-header-btn')) return;
        var navbar = document.querySelector('.navbar-header');
        if (!navbar) {
            setTimeout(injectHeaderButton, 500);
            return;
        }
        var btn = document.createElement('button');
        btn.id = 'SmartEval-header-btn';
        btn.type = 'button';
        btn.className = 'btn btn-primary navbar-btn';
        btn.textContent = '智能评价';
        btn.style.cssText = 'margin-right:10px;';
        btn.addEventListener('click', function () {
            PageAdapter.clearCache();
            DialogUI.show(true);
        });
        navbar.appendChild(btn);

        // 停止轮询按钮（默认隐藏，轮询时显示）
        var stopBtn = document.createElement('button');
        stopBtn.id = 'SmartEval-stop-btn';
        stopBtn.className = 'btn btn-danger navbar-btn';
        stopBtn.textContent = '停止轮询';
        stopBtn.style.cssText = 'margin-left:15px;display:none;';
        stopBtn.addEventListener('click', function () {
            if (window._easyaceStopCallback) {
                window._easyaceStopCallback();
            }
        });
        navbar.appendChild(stopBtn);
    }

    // 全局停止回调，供循环函数注册
    window._easyaceStopCallback = null;

    // 模块：主入口

    function main() {
        console.log('%c[SmartEval] v1.0.0 已加载 %c页面: ' + window.location.href,
            'color:#1a73e8;font-weight:bold', 'color:#999');

        function start() {
            console.log('[SmartEval] 正在初始化...');
            injectHeaderButton();
            injectButton();
            watchTeacherChange();
            registerShortcuts();
            console.log('[SmartEval] 初始化完成');
            // 初始化完成后跳转一次教师
            setTimeout(tryAutoJumpOnce, 100);
        }

        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(start, 200);
        } else {
            document.addEventListener('DOMContentLoaded', function () {
                setTimeout(start, 200);
            });
        }
    }

    main();

})();
