window.expandButtons = [
    
    // 摆臂角度
    {
        id: 'expandAngleDetail',
        title: '摆臂角度详细信息',
        content: `
          <div class="info-section">
            <div class="info-title">肘关节弯曲角度</div>
           </div>
          <div class="info-section">
            <div class="info-title">改进建议</div>
            <div class="info-text"><span id="elbowAngleRecommendation" class="info-value">当前姿势良好，无需改进</span></div>

          </div>
          <div class="info-section">
            <div class="info-title">具体描述</div>
            <div class="info-text">摆臂过程中肘关节的弯曲程度（上臂与前臂的夹角）。</div>
          </div>
          <div class="info-section">
            <div class="info-title">评价标准（理想状态）</div>
            <ul class="info-list">
              <li>向前摆动：上臂与躯干夹角约 15°-30°（避免过度前摆导致身体前倾过大）</li>
              <li>向后摆动：上臂与躯干夹角约 30°-45°（后摆幅度略大于前摆，可辅助躯干稳定）</li>
            </ul>
          </div>
          <hr>
          <div class="info-section">
            <div class="info-title">左右摆臂角度</div>
          </div>
          <div class="info-section">
            <div class="info-title">改进建议</div>
            <div class="info-text"><span id="leftRightMagOrAngleRecommendation" class="info-value">当前姿势良好，无需改进</span></div>
          </div>
          <div class="info-section">
            <div class="info-title">具体描述</div>
            <div class="info-text">上臂偏离身体中线向左右两侧摆动的夹角（外展角度）。</div>
          </div>
          <div class="info-section">
            <div class="info-title">评价标准（理想状态）</div>
            <ul class="info-list">
              <li>左右偏离角度≤10°（过度外展会导致躯干晃动，浪费能量；过度内扣会限制摆幅）</li>
            </ul>
          </div>
          <hr>
          <div class="info-section">
            <div class="info-title">前后摆臂角度</div>
          </div>
          <div class="info-section">
            <div class="info-title">改进建议</div>
            <div class="info-text"><span id="frontBackMagOrAngleRecommendation" class="info-value">当前姿势良好，无需改进</span></div>

          </div>
          <div class="info-section">
            <div class="info-title">具体描述</div>
            <div class="info-text">上臂相对于身体纵轴（躯干）向前、向后摆动时的夹角（以躯干中线为基准）。</div>
          </div>
          <div class="info-section">
            <div class="info-title">评价标准（理想状态）</div>
            <ul class="info-list">
              <li>向前摆动：上臂与躯干夹角约 15°-30°（避免过度前摆导致身体前倾过大）</li>
              <li>向后摆动：上臂与躯干夹角约 30°-45°（后摆幅度略大于前摆，可辅助躯干稳定）</li>
            </ul>
          </div>
          <hr>
          <!-- 后续可继续添加新的子元素组 -->
        `
    },
    
    // 摆臂幅度
    {
        id: 'expandSwingDetail',
        title: '摆臂幅度详细信息',
        content: `
                <div class="info-section">
                    <div class="info-title">左右摆幅</div>
              </div>
                <div class="info-section">
                    <div class="info-title">改进建议</div>
                    <div class="info-text"><span id="leftRightMagOrAngleRecommendation" class="info-value">当前姿势良好，无需改进</span></div>

                </div>
                <div class="info-section">
                    <div class="info-title">具体描述</div>
                    <div class="info-text">手部或上臂向身体中线左侧、右侧摆动的最大位移（以身体中线为基准）。</div>
                </div>
                <div class="info-section">
                    <div class="info-title">评价标准（理想状态）</div>
                    <ul class="info-list">
                        <li>左侧摆幅：距身体中线 8 - 12cm（避免过度外展导致躯干扭转，或过度内扣限制摆幅效率）</li>
                        <li>右侧摆幅：距身体中线 8 - 12cm（双侧对称，差异过大会破坏步态平衡）</li>
                        <li>左右摆幅差 ≤3cm（不对称会增加能量损耗，降低动作稳定性）</li>
                    </ul>
                </div>
                <hr>
                <div class="info-section">
                    <div class="info-title">前后摆幅</div>
                </div>
                <div class="info-section">
                    <div class="info-title">改进建议</div>
                    <div class="info-text"><span id="frontBackMagOrAngleRecommendation" class="info-value">当前姿势良好，无需改进</span></div>
                </div>
                <div class="info-section">
                    <div class="info-title">具体描述</div>
                    <div class="info-text">手部或肘部向前、向后摆动的最大位移（以身体中线为起点）。</div>
                </div>
                <div class="info-section">
                    <div class="info-title">评价标准（理想状态）</div>
                    <ul class="info-list">
                        <li>手部前摆：不超过胸前乳头连线水平（约距身体中线 15 - 20cm）</li>
                        <li>手部后摆：不超过腰侧髂骨水平（约距身体中线 20 - 25cm）</li>
                        <li>前后摆幅差 ≤5cm（后摆略大于前摆）</li>
                    </ul>
                </div>
            `
    },

    // 摆臂对称性
    {
        id: 'expandSymmetryDetail',
        title: '摆臂对称性详细信息',
        content: `
                <div class="info-section">
                    <div class="info-title">左右摆臂对称性</div>
              </div>
                <div class="info-section">
                    <div class="info-title">改进建议</div>
                    <div class="info-text"><span id="leftRightArmSymmetryRecommendation" class="info-value">当前姿势良好，无需改进</span></div>

                </div>
                <div class="info-section">
                    <div class="info-title">具体描述</div>
                    <div class="info-text">左右臂在摆幅、角度、速度上的差异（如左 / 右臂前摆最大角度的差值）。</div>
                </div>
                <div class="info-section">
                    <div class="info-title">评价标准（理想状态）</div>
                    <ul class="info-list">
                        <li>左右摆臂对称性：各参数差异≤5%（差异过大易导致躯干倾斜，增加单侧关节压力）。</li>
                    </ul>
                </div>
                <hr>
                <div class="info-section">
                    <div class="info-title">前后摆臂对称性</div>

                </div>
                <div class="info-section">
                    <div class="info-title">改进建议</div>
                    <div class="info-text"><span id="frontBackArmSymmetryRecommendation" class="info-value">当前姿势良好，无需改进</span></div>
                </div>
                <div class="info-section">
                    <div class="info-title">具体描述</div>
                    <div class="info-text">左右臂在摆幅、角度、速度上的差异（如左 / 右臂前摆最大角度的差值）。</div>
                </div>
                <div class="info-section">
                    <div class="info-title">评价标准（理想状态）</div>
                    <ul class="info-list">
                        <li>前后摆臂对称性：各参数差异≤5%（差异过大易导致躯干倾斜，增加单侧关节压力）。</li>
                    </ul>
                </div>
            `
    },
    
    // 摆臂协调性
    {
        id: 'expandCoordinationDetail',
        title: '摆臂协调性详细信息',
        content: `
                <div class="info-section">
                    <div class="info-title">摆臂与步频协调性</div>
                </div>
                <div class="info-section">
                    <div class="info-title">改进建议</div>
                    <div class="info-text"><span id="armStepCoordinationRecommendation" class="info-value">当前姿势良好，无需改进</span></div>

                </div>
                <div class="info-section">
                    <div class="info-title">具体描述</div>
                    <div class="info-text">摆臂频率与步频的匹配度（摆臂次数 / 步频次数的比值）。</div>
                </div>
                <div class="info-section">
                    <div class="info-title">评价标准（理想状态）</div>
                    <ul class="info-list">
                        <li>比值为 1:1（即每步对应一次完整摆臂循环，误差≤±1 次 / 分钟，避免 “步快臂慢” 或 “臂快步慢”）。</li>
                    </ul>
                </div>
                <hr>
            `
    }
];
