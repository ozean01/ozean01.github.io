# 发布记录（CHANGELOG）

只记「给使用者的变化」，不记工程细节。工程口径与门禁见 `README.md`，发布/回滚步骤见 README「每次更新线上（原子发布）」。

## v1.12.0 · 2026-10-20 · CACHE fte-v106

**修「再次双击快捷方式看到启动失败」**
- 浏览器关了、旧服务窗口还开着时，再次双击会提示端口被占并退出，看起来像站点坏了。现在启动器会先探测占用者是不是本站：是则直接复用已运行的服务并打开浏览器，学习数据不受影响。

**修教学内容的硬错误**
- HS 速查表：两个不存在的子目 `3920.32` / `3920.49` 已改为 `3920.41 / 3920.42` 与 `3920.99`；染整助剂 `3809.10` → `3809.91`（旧编码是淀粉基助剂，与「染整」不符）。
- 术语库：3 条会被当作「站内标准写法」展示的英文别名病句已改正（`curing agent did not used` → `was not added`；`overdose curing agent` → `excess curing agent`；`decrease abnormally of…` → `abnormal drop in the factors that consume…`）。
- Incoterms：CFR 不再叫「到港价」（风险仍在装运港装船时转移）；CIP 保额说法改正（与 CIF 同为发票金额 110%，差别在险别 ICC A / ICC C）；运费算例 20 吨 → 18 吨，与「每公斤 0.10、CIF 3.32」自洽。
- 单证与海运：尾款条件改为「凭提单副本」（原「提单草稿」不是付款节点）；B/N 与 S/O 不再写「等同」；DDC 改为「通常由收货人承担」；`Whoever pays` 病句改写。
- 合同风险：penalty clause 补「英美法下可能不可执行」提示；governing law 中文释义主客修正。

**音标统一为站内声明的美式 GA**
- `gravure /ɡrəˈvjʊr/`、`rotogravure /ˌroʊtəɡrəˈvjʊr/`、`force majeure /ˌfɔːrs mæˈʒɜːr/`、`schedule /ˈskedʒuːl/`、`curing /ˈkjʊrɪŋ/`、`clearance /ˈklɪrəns/`、`jurisdiction`、`material`、`demurrage`、`procurement` 等 20 余条；`proforma invoice` 全站统一为 `/proʊˈfɔːrmə ˈɪnvɔɪs/`。

**写法与数字统一**
- 胶水涂布克重 `gsm` → `g/m²`（纸板 90 gsm 保留）；强度单位统一 `N/15mm`；摄氏度统一 `°C`；百分比间距统一；文档里过期的 `768` → `798`。

**界面与可用性（与上一批合并发布）**
- 单词卡/语块卡背面被裁切修复；按钮文案与含义对齐（朗读 🔊 / 诊断 🧪 / 评测 🎯）；空态不再把「没有内容」说成「已全部掌握」；44px 触控目标补齐；`.ob-bar`、`.btn-ghost` 对比度修复；快捷键说明补 `Enter`。
- 启动器提示删除已移除的「本地离线模型」。

## v1.11.0 · 2026-10-11

- 上一线上版本（`fte-v104`）。详见当时提交历史。
