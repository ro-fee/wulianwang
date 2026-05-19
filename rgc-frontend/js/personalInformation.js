let cropper = null;
let currentTheme = localStorage.getItem('theme') || 'light';
let activityChart = null;

const defaultGoals = {
    steps: 10000, stepsDone: 0,
    time: 60, timeDone: 0,
    calories: 500, caloriesDone: 0
};
const defaultUser = {
    nickname: "管理员",
    gender: "男",
    age: 25,
    height: 175,
    weight: 70,
    sportsGoal: "保持健康",
    upperArmLength: 30,
    lowerArmLength: 30
};

document.addEventListener('DOMContentLoaded', function () {
    initializeTheme();
    initializeSidebar();
    initializeAvatarUpload();
    initializeProfileForm();
    loadUserData();
    loadGoals();
    initializeGoalSetting();
    initializeActivityChart();
});

// 主题
function initializeTheme() {
    const themeToggle = document.getElementById('themeToggle');
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeIcon();
    themeToggle.addEventListener('click', () => {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', currentTheme);
        localStorage.setItem('theme', currentTheme);
        updateThemeIcon();
    });
}

function updateThemeIcon() {
    const themeIcon = document.getElementById('themeIcon');
    themeIcon.className = currentTheme === 'light'
        ? 'fa-solid fa-moon text-lg'
        : 'fa-solid fa-sun text-lg';
}

// 侧栏
function initializeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.add('open');
        sidebarOverlay.classList.remove('hidden');
    });
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.add('hidden');
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.add('hidden');
        }
    });
}

// 头像
function initializeAvatarUpload() {
    const avatarUploadBtn = document.getElementById('avatarUploadBtn');
    const avatarModal = document.getElementById('avatarModal');
    const closeAvatarModal = document.getElementById('closeAvatarModal');
    const avatarInput = document.getElementById('avatarInput');
    const selectImageBtn = document.getElementById('selectImageBtn');
    const cropperContainer = document.getElementById('cropperContainer');
    const cropperImage = document.getElementById('cropperImage');
    const cancelCrop = document.getElementById('cancelCrop');
    const confirmCrop = document.getElementById('confirmCrop');
    avatarUploadBtn.addEventListener('click', function () {
        avatarModal.classList.remove('hidden');
    });
    closeAvatarModal.addEventListener('click', function () {
        avatarModal.classList.add('hidden');
        resetCropper();
    });
    selectImageBtn.addEventListener('click', function () {
        avatarInput.click();
    });
    avatarInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (ev) {
                cropperImage.src = ev.target.result;
                cropperContainer.classList.remove('hidden');
                selectImageBtn.textContent = '重新选择';
                if (cropper) cropper.destroy();
                cropper = new Cropper(cropperImage, {
                    aspectRatio: 1, viewMode: 1, autoCropArea: .8,
                });
            };
            reader.readAsDataURL(file);
        }
    });
    cancelCrop.addEventListener('click', function () {
        resetCropper();
    });
    confirmCrop.addEventListener('click', function () {
        if (cropper) {
            const canvas = cropper.getCroppedCanvas({
                width: 200, height: 200, imageSmoothingQuality: 'high'
            });
            const croppedImage = canvas.toDataURL('image/jpeg', 0.95);
            document.getElementById('userAvatar').src = croppedImage;
            document.getElementById('sidebarAvatar').src = croppedImage;
            localStorage.setItem('userAvatar', croppedImage);
            avatarModal.classList.add('hidden');
            resetCropper();
            showNotification("头像更新成功", "success");
        }
    });
    confirmCrop.addEventListener('click', function () {
        if (cropper) {
            const canvas = cropper.getCroppedCanvas({
                width: 200, height: 200, imageSmoothingQuality: 'high'
            });
            const croppedImage = canvas.toDataURL('image/jpeg', 0.95);
            document.getElementById('userAvatar').src = croppedImage;
            document.getElementById('sidebarAvatar').src = croppedImage;
            localStorage.setItem('userAvatar', croppedImage);

            // 更新首页显示
            if (window.opener) {
                window.opener.postMessage({type: 'updateUserAvatar', data: croppedImage}, '*');
            }

            avatarModal.classList.add('hidden');
            resetCropper();
            showNotification("头像更新成功", "success");
        }
    });
}

function resetCropper() {
    const cropperContainer = document.getElementById('cropperContainer');
    const cropperImage = document.getElementById('cropperImage');
    cropperContainer.classList.add('hidden');
    cropperImage.src = '';
    document.getElementById('selectImageBtn').textContent = '选择图片';
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    document.getElementById('avatarInput').value = '';
}

// 表单
function initializeProfileForm() {
    const form = document.getElementById('profileForm');
    const resetBtn = document.getElementById('resetForm');
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!validateForm()) return;
        const nickname = document.getElementById('nickname').value.trim() || "未命名用户";
        const gender = document.getElementById('gender').value;
        const age = parseInt(document.getElementById('age').value) || defaultUser.age;
        const height = parseFloat(document.getElementById('height').value) || defaultUser.height;
        const weight = parseFloat(document.getElementById('weight').value) || defaultUser.weight;
        const upperArmLength = parseFloat(document.getElementById('upperArmLength').value) || defaultUser.upperArmLength;
        const lowerArmLength = parseFloat(document.getElementById('lowerArmLength').value) || defaultUser.lowerArmLength;
        const sportsGoal = document.getElementById('sportsGoal').value;
        const info = {nickname, gender, age, height, weight, upperArmLength, lowerArmLength, sportsGoal};

        // 保存用户信息
        localStorage.setItem('userInfo', JSON.stringify(info));

        // 更新首页显示
        if (window.opener) {
            window.opener.postMessage({type: 'updateUserInfo', data: info}, '*');
        }

        // 更新当前页面
        setProfileCard(info);
        showNotification("个人资料已保存", "success");
    });

    resetBtn.addEventListener('click', function () {
        loadUserData();
        showNotification("已重置为上次保存值", "info");
    });
}

// 添加消息监听器
window.addEventListener('message', function (event) {
    if (event.data.type === 'updateUserInfo') {
        setProfileCard(event.data.data);
    } else if (event.data.type === 'updateUserAvatar') {
        document.getElementById('userAvatar').src = event.data.data;
        document.getElementById('sidebarAvatar').src = event.data.data;
    }
});

function validateForm() {
    const age = document.getElementById('age');
    const height = document.getElementById('height');
    const weight = document.getElementById('weight');
    const upperArmLength = document.getElementById('upperArmLength');
    const lowerArmLength = document.getElementById('lowerArmLength');
    let valid = true;
    if (age.value < 1 || age.value > 120) {
        showInputError(age, "年龄1~120");
        valid = false;
    } else clearInputError(age);
    if (height.value < 100 || height.value > 250) {
        showInputError(height, "身高须100-250");
        valid = false;
    } else clearInputError(height);
    if (weight.value < 30 || weight.value > 300) {
        showInputError(weight, "体重须30-300");
        valid = false;
    } else clearInputError(weight);
    if (upperArmLength.value < 15 || upperArmLength.value > 50) {
        showInputError(upperArmLength, "大臂长须15-50");
        valid = false;
    } else clearInputError(upperArmLength);
    if (lowerArmLength.value < 30 || lowerArmLength.value > 60) {
        showInputError(lowerArmLength, "小臂长须30-60");
        valid = false;
    } else clearInputError(lowerArmLength);
    return valid;
}

function showInputError(input, text) {
    clearInputError(input);
    const error = document.createElement('p');
    error.className = 'text-error text-xs mt-1';
    error.textContent = text;
    input.parentNode.appendChild(error);
    input.classList.add('border-error');
}

function clearInputError(input) {
    const error = input.parentNode.querySelector('.text-error');
    if (error) error.remove();
    input.classList.remove('border-error');
}

function loadUserData() {
    const avatar = localStorage.getItem('userAvatar');
    document.getElementById('userAvatar').src =
        avatar || "img/rungirl.jpg";
    document.getElementById('sidebarAvatar').src =
        avatar || "img/rungirl.jpg";
    let info = localStorage.getItem('userInfo');
    info = info ? JSON.parse(info) : {...defaultUser};
    document.getElementById('nickname').value = info.nickname;
    document.getElementById('gender').value = info.gender;
    document.getElementById('age').value = info.age;
    document.getElementById('height').value = info.height;
    document.getElementById('weight').value = info.weight;
    document.getElementById('upperArmLength').value = info.upperArmLength;
    document.getElementById('lowerArmLength').value = info.lowerArmLength;
    document.getElementById('sportsGoal').value = info.sportsGoal;
    setProfileCard(info);
}

function setProfileCard(info) {
    document.getElementById('profileUserName').textContent = info.nickname;
    document.getElementById('sidebarUserName').textContent = info.nickname;
    document.getElementById('profileGender').textContent = info.gender;
    document.getElementById('profileAge').textContent = info.age + "岁";
    document.getElementById('profileHeight').textContent = info.height + "cm";
    document.getElementById('profileHeightVal').textContent = info.height + "cm";
    document.getElementById('profileWeight').textContent = info.weight + "kg";
    document.getElementById('profileWeightVal').textContent = info.weight + "kg";
    let bmi = '--', bmiValue = 0, bmiStatus = '--', bmiStatusClass = '';
    if (info.height && info.weight) {
        const h = info.height / 100;
        bmiValue = info.weight / (h * h);
        bmi = bmiValue.toFixed(1);
        if (bmiValue < 18.5) {
            bmiStatus = '过轻';
            bmiStatusClass = 'text-blue-500';
        } else if (bmiValue < 24) {
            bmiStatus = '正常';
            bmiStatusClass = 'text-success';
        } else if (bmiValue < 28) {
            bmiStatus = '超重';
            bmiStatusClass = 'text-warning';
        } else {
            bmiStatus = '肥胖';
            bmiStatusClass = 'text-error';
        }
    }
    document.getElementById('profileBMI').textContent = bmi;
    document.getElementById('bmiStatus').textContent = bmiStatus;
    document.getElementById('bmiStatus').className = "text-xs font-semibold mb-1 " + bmiStatusClass;
    if (bmiValue > 0) {
        let pos = 0;
        if (bmiValue < 18.5) pos = (bmiValue / 18.5) * 18.5;
        else if (bmiValue < 24) pos = 18.5 + ((bmiValue - 18.5) / (24 - 18.5)) * 5.5;
        else if (bmiValue < 28) pos = 24 + ((bmiValue - 24) / 4) * 4;
        else pos = Math.min(28 + ((bmiValue - 28) * 2), 100);
        pos = Math.min(pos, 100);
        document.getElementById('bmiMarker').style.left = `${pos}%`;
    }
}

// 运动目标
function initializeGoalSetting() {
    const editBtn = document.getElementById('editGoalsBtn');
    const goalModal = document.getElementById('goalModal');
    const closeGoalModal = document.getElementById('closeGoalModal');
    const cancelGoal = document.getElementById('cancelGoal');
    const saveGoals = document.getElementById('saveGoals');
    editBtn.addEventListener('click', showEditGoalModal);
    closeGoalModal.addEventListener('click', () => goalModal.classList.add('hidden'));
    cancelGoal.addEventListener('click', () => goalModal.classList.add('hidden'));
    saveGoals.addEventListener('click', function () {
        const st = parseInt(document.getElementById('goalStepInput').value) || 10000;
        const ste = parseInt(document.getElementById('goalStepDoneInput').value) || 0;
        const tm = parseInt(document.getElementById('goalTimeInput').value) || 60;
        const tme = parseInt(document.getElementById('goalTimeDoneInput').value) || 0;
        const cal = parseInt(document.getElementById('goalCalorieInput').value) || 500;
        const cale = parseInt(document.getElementById('goalCalorieDoneInput').value) || 0;
        if (st < 1 || tm < 1 || cal < 1 || ste < 0 || ste > st || tme < 0 || tme > tm || cale < 0 || cale > cal) {
            showNotification("目标或进度输入合理数值", "error");
            return;
        }
        const goals = {steps: st, stepsDone: ste, time: tm, timeDone: tme, calories: cal, caloriesDone: cale};
        localStorage.setItem('userGoals', JSON.stringify(goals));
        renderGoals(goals);
        goalModal.classList.add('hidden');
        showNotification("运动目标和进度已保存", "success");
    });
}

function showEditGoalModal() {
    const goalModal = document.getElementById('goalModal');
    const goals = loadGoals() || defaultGoals;
    document.getElementById('goalStepInput').value = goals.steps;
    document.getElementById('goalStepDoneInput').value = goals.stepsDone;
    document.getElementById('goalTimeInput').value = goals.time;
    document.getElementById('goalTimeDoneInput').value = goals.timeDone;
    document.getElementById('goalCalorieInput').value = goals.calories;
    document.getElementById('goalCalorieDoneInput').value = goals.caloriesDone;
    goalModal.classList.remove('hidden');
}

function loadGoals() {
    let goals = localStorage.getItem('userGoals');
    goals = goals ? JSON.parse(goals) : {...defaultGoals};
    renderGoals(goals);
    return goals;
}

function renderGoals(goals) {
    document.getElementById('goalStepValue').textContent = goals.steps.toLocaleString();
    document.getElementById('goalStepProgress').textContent = `${goals.stepsDone}/${goals.steps}`;
    document.getElementById('goalStepProgressBar').style.width = (goals.steps === 0 ? '0' : (goals.stepsDone / goals.steps * 100).toFixed(0)) + "%";
    document.getElementById('goalTimeValue').textContent = goals.time + "分钟";
    document.getElementById('goalTimeProgress').textContent = `${goals.timeDone}/${goals.time}分钟`;
    document.getElementById('goalTimeProgressBar').style.width = (goals.time === 0 ? '0' : (goals.timeDone / goals.time * 100).toFixed(0)) + "%";
    document.getElementById('goalCalorieValue').textContent = goals.calories;
    document.getElementById('goalCalorieProgress').textContent = `${goals.caloriesDone}/${goals.calories}`;
    document.getElementById('goalCalorieProgressBar').style.width = (goals.calories === 0 ? '0' : (goals.caloriesDone / goals.calories * 100).toFixed(0)) + "%";
}

// 图表
function initializeActivityChart() {
    const ctx = document.getElementById('activityChart').getContext('2d');
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const stepsData = [8000, 9500, 7000, 10500, 12000, 6500, 11000];
    const caloriesData = [420, 480, 370, 520, 600, 340, 550];
    if (activityChart) activityChart.destroy();
    activityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: days,
            datasets: [
                {
                    label: '步数',
                    data: stepsData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    tension: 0.3, fill: true, yAxisID: 'y'
                },
                {
                    label: '卡路里',
                    data: caloriesData,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139,92,246,0.08)',
                    tension: 0.3, fill: true, yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {mode: 'index', intersect: false},
            scales: {
                y: {type: 'linear', position: 'left', title: {display: true, text: '步数'}},
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: {display: true, text: '卡路里'},
                    grid: {drawOnChartArea: false}
                }
            }
        }
    });
}

function showNotification(msg, type) {
    let color = 'bg-primary text-white';
    if (type === "success") color = "bg-success text-white";
    else if (type === "error") color = "bg-error text-white";
    else if (type === "info") color = "bg-blue-500 text-white";
    else if (type === "warning") color = "bg-warning text-white";
    const exist = document.querySelector(".notification");
    if (exist) exist.remove();
    let notif = document.createElement('div');
    notif.className = `notification ${color}`;
    notif.textContent = msg;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 1800);
}