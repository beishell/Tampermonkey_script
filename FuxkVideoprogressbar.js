// ==UserScript==
// @name         通用视频加速 (V4 - 智能按需加载)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  只在有视频的页面激活悬浮球。修复视频分段、切P导致的速度重置问题。快捷键 [ ] \ 调速，Ctrl+Shift+S 开关控件。
// @author       Gemini
// @match        *://*/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- 解决重复执行问题 (哨兵) ---
    // 确保脚本在同一个 window 上只运行一次
    if (window.tampermonkeyVideoSpeedController) {
        return;
    }
    window.tampermonkeyVideoSpeedController = true;

    let currentSpeed = 1.0;
    const maxSpeed = 32.0;
    const minSpeed = 0.5;
    const step = 0.5;

    let feedbackTimer = null;
    let speedDisplayElement; // 悬浮球DOM
    let floatContainer;      // 悬浮球父容器
    let controlsVisible = true; // 控件是否可见
    let uiCreated = false;     // UI是否已创建
    let activeVideos = new Set(); // 存储当前页面上的所有video元素

    // --- 核心功能：更新与捍卫速度 ---

    /**
     * 强制更新所有已知视频元素的速度
     */
    function applySpeedToAllVideos() {
        if (!activeVideos || activeVideos.size === 0) return;

        activeVideos.forEach(video => {
            // 检查视频是否还在DOM中
            if (!document.body.contains(video)) {
                activeVideos.delete(video); // 从集合中移除
                return;
            }
            // 只要当前速度不是1.0，就强制设置
            if (video.playbackRate !== currentSpeed) {
                video.playbackRate = currentSpeed;
            }
        });
    }

    /**
     * 用户主动设置新速度（来自快捷键或点击）
     * @param {number} newSpeed - 目标新速度
     */
    function setNewSpeed(newSpeed) {
        newSpeed = Math.max(minSpeed, Math.min(maxSpeed, newSpeed));
        currentSpeed = newSpeed;

        if (speedDisplayElement) {
            speedDisplayElement.textContent = `${currentSpeed.toFixed(1)}x`;
        }

        applySpeedToAllVideos(); // 立即应用到所有视频

        // 显示瞬时反馈
        const firstVideo = activeVideos.size > 0 ? activeVideos.values().next().value : null;
        showSpeedFeedback(`${currentSpeed.toFixed(1)}x`, firstVideo);
    }

    // --- 核心问题修复：捍卫播放速度 ---

    // 监听 'ratechange' 事件。当网站试图将速度改回1.0时，我们将其改回去。
    function handleRateChange(e) {
        const video = e.target;
        // 如果 currentSpeed 不是 1.0 (即用户设置了倍速)
        // 并且 视频的播放速度被外部改成了 1.0
        // 那么我们就强制把它改回 currentSpeed
        if (currentSpeed !== 1.0 && video.playbackRate === 1.0) {
            video.playbackRate = currentSpeed;
        }
    }

    // 监听 'timeupdate'，作为一种低频轮询的补充
    // 有些网站（如B站）的播放器会在内部状态改变时重置速度
    function handleTimeUpdate(e) {
        const video = e.target;
        if (video.playbackRate !== currentSpeed) {
             video.playbackRate = currentSpeed;
        }
    }


    /**
     * 注册视频元素，添加监听器
     * @param {HTMLVideoElement} video
     */
    function registerVideo(video) {
        if (!activeVideos.has(video)) {
            activeVideos.add(video);
            video.playbackRate = currentSpeed; // 立即设置当前速度

            // 添加速度捍卫监听器
            video.addEventListener('ratechange', handleRateChange);
            video.addEventListener('timeupdate', handleTimeUpdate);
        }
    }

    // --- 按需加载：检测视频并控制UI ---

    /**
     * 检测页面上是否有视频，并控制UI显隐
     */
    function checkVideoPresence() {
        const videos = document.querySelectorAll('video');

        // 注册新发现的视频
        videos.forEach(video => {
            if (video.readyState > 0 || video.src) { // 确保视频已初始化
                registerVideo(video);
            }
        });

        if (activeVideos.size > 0) {
            // 页面上有视频
            if (!uiCreated) {
                // 第一次检测到视频，创建UI
                createFloatUI();
                addGlobalStyles();
                uiCreated = true;
            }
            // 显示UI (如果用户没有手动隐藏它)
            if (floatContainer && controlsVisible) {
                floatContainer.style.display = 'flex';
            }
        } else {
            // 页面上没有视频
            if (floatContainer) {
                floatContainer.style.display = 'none'; // 隐藏UI
            }
        }
    }


    // --- UI 创建与反馈 ---

    function createFloatUI() {
        floatContainer = document.createElement('div');
        floatContainer.id = 'tampermonkey-float-container';
        floatContainer.style.display = 'none'; // 默认隐藏，直到检测到视频

        const controlsPanel = document.createElement('div');
        controlsPanel.id = 'tampermonkey-float-controls';

        const btnMinus = document.createElement('button');
        btnMinus.textContent = '－';
        btnMinus.title = '减速 ( [ )';
        btnMinus.onclick = (e) => { e.stopPropagation(); setNewSpeed(currentSpeed - step); };

        const btnReset = document.createElement('button');
        btnReset.textContent = '1x';
        btnReset.title = '恢复 ( \\ )';
        btnReset.onclick = (e) => { e.stopPropagation(); setNewSpeed(1.0); };

        const btnPlus = document.createElement('button');
        btnPlus.textContent = '＋';
        btnPlus.title = '加速 ( ] )';
        btnPlus.onclick = (e) => { e.stopPropagation(); setNewSpeed(currentSpeed + step); };

        controlsPanel.append(btnMinus, btnReset, btnPlus);

        speedDisplayElement = document.createElement('div');
        speedDisplayElement.id = 'tampermonkey-float-ball';
        speedDisplayElement.title = '视频速度控制器 (Ctrl+Shift+S 开关)';
        speedDisplayElement.textContent = `${currentSpeed.toFixed(1)}x`;

        floatContainer.append(controlsPanel, speedDisplayElement);
        document.body.appendChild(floatContainer);
    }

    function addGlobalStyles() {
        GM_addStyle(`
            #tampermonkey-float-container {
                position: fixed;
                bottom: 30px;
                right: -25px; /* 默认半隐藏 */
                z-index: 9999998;
                display: flex;
                align-items: center;
                opacity: 0.7;
                transition: right 0.3s ease, opacity 0.3s ease, display 0.1s;
            }
            #tampermonkey-float-container:hover {
                right: 20px;
                opacity: 1;
            }
            #tampermonkey-float-ball {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                font-size: 16px;
                font-weight: bold;
                font-family: Arial, sans-serif;
                display: grid;
                place-items: center;
                cursor: pointer;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                transition: background-color 0.3s ease;
                z-index: 10;
                pointer-events: auto;
            }
            #tampermonkey-float-container:hover #tampermonkey-float-ball {
                background-color: rgba(0, 0, 0, 0.9);
            }
            #tampermonkey-float-controls {
                display: flex;
                background-color: rgba(255, 255, 255, 0.95);
                border-radius: 25px 0 0 25px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                width: 0;
                opacity: 0;
                overflow: hidden;
                pointer-events: none;
                margin-right: -25px;
                padding-left: 15px;
                transition: all 0.3s ease-out;
            }
            #tampermonkey-float-container:hover #tampermonkey-float-controls {
                width: 140px;
                opacity: 1;
                pointer-events: auto;
            }
            #tampermonkey-float-controls button {
                padding: 10px 10px;
                font-size: 18px;
                width: 40px;
                font-weight: bold;
                color: #333;
                background-color: transparent;
                border: none;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            #tampermonkey-float-controls button:hover { color: #000; }
            #tampermonkey-float-controls button:nth-child(2) { font-size: 16px; }
        `);
    }

    function showSpeedFeedback(text, targetVideo) {
        let feedbackEl = document.getElementById('tampermonkey-speed-feedback-popup');
        if (!feedbackEl) {
            feedbackEl = document.createElement('div');
            feedbackEl.id = 'tampermonkey-speed-feedback-popup';
            document.body.appendChild(feedbackEl);
        }
        Object.assign(feedbackEl.style, {
            position: 'fixed', zIndex: '9999999', padding: '12px 25px',
            backgroundColor: 'rgba(0, 0, 0, 0.75)', color: 'white',
            fontSize: '26px', fontFamily: 'Arial, sans-serif',
            borderRadius: '8px', opacity: '1',
            transition: 'opacity 0.5s ease-out', pointerEvents: 'none'
        });
        if (targetVideo && document.body.contains(targetVideo)) {
            const rect = targetVideo.getBoundingClientRect();
            Object.assign(feedbackEl.style, {
                top: `${rect.top + (rect.height / 2)}px`,
                left: `${rect.left + (rect.width / 2)}px`,
                right: 'auto', transform: 'translate(-50%, -50%)'
            });
        } else {
            Object.assign(feedbackEl.style, {
                top: '40px', right: '40px', left: 'auto', transform: 'none'
            });
        }
        feedbackEl.textContent = text;
        if (feedbackTimer) clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => { feedbackEl.style.opacity = '0'; }, 1500);
    }

    // --- 事件监听 (快捷键) ---

    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
            e.preventDefault();
            controlsVisible = !controlsVisible;
            if (floatContainer) {
                floatContainer.style.display = (controlsVisible && activeVideos.size > 0) ? 'flex' : 'none';
            }
            showSpeedFeedback(controlsVisible ? "控件已开启" : "控件已关闭", null);
            return;
        }

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }

        let handled = false;
        let newSpeed = currentSpeed;

        switch(e.key) {
            case '[': newSpeed = currentSpeed - step; handled = true; break;
            case ']': newSpeed = currentSpeed + step; handled = true; break;
            case '\\': newSpeed = 1.0; handled = true; break;
        }

        if (handled) {
            e.preventDefault();
            setNewSpeed(newSpeed);
        }
    }, true); // 使用捕获阶段，提高响应优先级

    // --- 启动脚本：使用 MutationObserver 和定时器 ---

    // 1. 使用 MutationObserver 动态发现 <video> 标签
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.tagName === 'VIDEO') {
                    registerVideo(node);
                }
                if (node.querySelectorAll) {
                    node.querySelectorAll('video').forEach(registerVideo);
                }
            });
        });
        // 每次DOM变动后都检查一下UI状态
        checkVideoPresence();
    });

    // 2. 页面加载完成后开始执行
    function init() {
        // 立即检查一次
        checkVideoPresence();

        // 开始监听DOM变化
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 3. 启动一个定时器，作为兜底方案
        // (用于检查视频显隐 和 捍卫速度)
        setInterval(() => {
            checkVideoPresence();
            applySpeedToAllVideos(); // 定期捍卫速度
        }, 1500); // 每1.5秒检查一次
    }

    // 等待 body 出现后再执行
    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
