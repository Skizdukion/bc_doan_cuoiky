# TECHNICAL REPORT – SPEAKING SCRIPT

Script dùng để trình bày miệng theo từng đề mục trong `Progress_Report_v2.md`. Nội dung chia thành các phần: mở bài, body chi tiết, ví dụ minh họa, điểm nhấn và từ điển khái niệm giúp người nghe dễ hiểu.

---

## 1. INTRODUCTION

**Opening:**  
“Kính thầy/cả nhóm, hôm nay em xin báo cáo tiến độ dự án VNDC – một pipeline ICO-ready ERC‑20 với cơ chế bảo vệ thanh khoản và cung cấp utility ngay sau khi nhà đầu tư nhận token. Em sẽ đi qua vấn đề, mục tiêu, cách triển khai, kết quả thử nghiệm, kế hoạch tiếp theo và phần từ điển khái niệm để mọi người dễ theo dõi.”

**Problem Statement (kèm ví dụ thực tế):**  
- Bối cảnh: nhiều ICO tự viết bị mất niềm tin do các rủi ro lớn như sau: 
  1. Chủ dự án mint token vô hạn rồi xả: ví dụ, dự án X chỉ cần giữ quyền `mint` trong contract, sau khi raise 100 ETH họ mint thêm 1 tỷ token và bán tháo, giá về 0; tệ hơn, nếu ví dev bị hack thì hacker cũng có thể tận dụng quyền `mint` để in vô hạn và phá giá ngay lập tức.  
  2. Thanh khoản bị rút sau khi raise: dự án Y gom đủ vốn rồi lặng lẽ rút LP khỏi Uniswap, để lại pool gần như trống rỗng; holder cố bán sẽ gặp trượt giá cực lớn, token gần như vô giá trị → rug pull.  
  3. Nhà đầu tư thiếu công cụ khoá/stake: dự án Z không có vesting cho team dev/advisor và cũng không có cơ chế staking cho user; team dev/advisor có thể xả dần lượng token lớn làm giá trượt rất nhanh, còn nhà đầu tư thì ngoài việc canh sóng để bán ra gần như không có động lực nắm giữ lâu dài, dẫn tới dump mạnh ngay sau khi claim (giá có thể giảm 70% chỉ trong 24h).  
- VNDC giải quyết bằng pipeline khép kín: quyền mint chuyển cho TokenSale để kiểm soát nguồn cung, thanh khoản được tự động bơm và khóa trong LP, nhà đầu tư có utility ngay (claim + stake) để giảm động lực bán sớm.

**Objectives & Scope:**  
- Mục tiêu chính: hoàn thiện 4 hợp đồng cốt lõi (ERC‑20, TokenSale, TokenVesting, Staking) với tính năng auto-liquidity tích hợp trong TokenSale, kèm script deploy, unit test, stress scenario.  
- Câu hỏi nghiên cứu:  
  - Vesting cliff + linear tương thích với mint sau ICO thế nào?  
  - Staking kiểm soát lạm phát ≤10%/năm mà vẫn giữ holder?  
  - Làm sao auto bơm LP từ số vốn raise mà không cần thao tác off-chain?  
- Phạm vi: triển khai hợp đồng, pipeline auto-liquidity, mô phỏng vesting/staking, đo gas & bảo mật cơ bản. Không bao gồm proxy upgrade, multisig, audit sâu, oracle giá.

**Contributions:**  
- Ứng dụng: xây trọn bộ contract + script deploy auto 30/30/40 (30% investor, 40% vesting, 30% LP).  
- Phân tích: đo gas từng khối, unit test TokenSale với router thực tế, chạy stress scenario.  
- Vận hành: chuẩn bị hướng dẫn + script để bất kỳ ai chạy lại pipeline local/testnet trong vài phút.

---

## 2. METHODOLOGY

## 2. METHODOLOGY

**Architecture Overview (Giải thích chi tiết):**  
- Hệ thống được thiết kế dạng module để dễ audit, test và bảo trì: mỗi hợp đồng giải quyết một vấn đề cụ thể nhưng kết nối với nhau thành một vòng đời token khép kín.  
  - `VNDC (ERC-20)`:
    - Token lõi, kế thừa chuẩn ERC‑20 của OpenZeppelin nên tương thích với hầu hết ví và DEX.  
    - Tích hợp `mint`, `burn`, `pause` và cơ chế chống reentrancy. Quan trọng nhất: ngay sau deploy, quyền `mint`(ownerShip) được chuyển hẳn sang `TokenSale`, không nằm trên ví dev → giảm rủi ro bị hack ví hoặc cố ý in token vô hạn.  
  - `TokenSale`:
    - Đóng vai trò “cửa ngõ” phát hành toàn bộ VNDC ra thị trường, hoạt động theo mô hình ICO fixed‑price (giá bán token cố định trong suốt thời gian sale).  
    - Nhận ETH từ nhà đầu tư, ghi nhận số VNDC mà mỗi ví sẽ được nhận, nhưng CHƯA mint ngay, đồng thời kiểm soát logic soft cap / hard cap và thời điểm kết thúc sale.  
    - Chỉ sau khi đạt soft cap và được gọi `finalize`, `TokenSale` mới mint tổng lượng VNDC cần thiết và phân bổ thành 3 phần: 30% cho investor, 40% gửi sang `TokenVesting`, 30% giữ lại để bơm thanh khoản.  
  - `TokenVesting`:
    - Đóng vai trò “kho khóa” token cho team dev/advisor.  
    - Áp dụng cơ chế **cliff** (khoảng thời gian đầu không nhận token) và **linear release** (sau cliff, token mở khoá từ từ theo thời gian).  
    - Nhờ đó, team không thể bán sạch token ngay sau ICO, tạo cam kết đồng hành dài hạn với dự án.  
  - `StakingContract`:
    - Tạo 3 gói staking 1, 3 và 6 tháng; user khoá VNDC vào pool, sau khi hết kỳ hạn sẽ nhận lại gốc + reward.  
    - Reward pool được nạp thủ công, giúp dự án kiểm soát tổng lạm phát không vượt quá mục tiêu (khoảng 10%/năm).  
    - Theo dõi `totalStaked`, `rewardPool` và có logic “dynamic APY boost”: nếu TVL giảm quá 10% so với baseline, APY tạm thời tăng để khuyến khích holder tiếp tục khoá token thay vì bán.  
  - `TokenSale (Auto-Liquidity feature)`:
    - Ngoài việc bán token, `TokenSale` còn tự động bơm thanh khoản lên DEX.  
    - Sau khi finalize, hợp đồng dùng 30% VNDC + toàn bộ ETH còn lại trong contract để gọi Uniswap v2 Router tạo pool VNDC/ETH; toàn bộ LP token trả về được giữ trong `TokenSale` và không có hàm rút → thanh khoản được khóa on‑chain, hạn chế kịch bản rug pull.

**Operational Flow (4 bước chi tiết với ví dụ):**  
1. **Investor gửi ETH vào `TokenSale`:**  
   - Ví dụ: 5 investor gửi lần lượt 5, 10, 15, 10 và 10 ETH, tổng cộng 50 ETH.  
   - Mỗi lần nhận ETH, `TokenSale` tính số VNDC tương ứng theo giá cố định và ghi vào mapping nội bộ; investor mới chỉ “giữ chỗ” quyền nhận token, VNDC thực tế chưa được mint.  

2. **Kết thúc sale – đạt hoặc không đạt soft cap:**  
   - Trường hợp **không đạt soft cap**: sau khi sale kết thúc mà tổng ETH < 50 ETH, owner dừng sale, nhà đầu tư có thể gọi hàm refund để nhận lại toàn bộ số ETH đã góp; các quyền claim VNDC bị huỷ.  
   - Trường hợp **đạt soft cap**: khi tổng ETH tích lũy ≥ 50 ETH và sale đã kết thúc, owner gọi `finalize`.  
   - Lúc này, `TokenSale` gọi sang VNDC để `mint` đủ số VNDC cần thiết, rồi chia làm 3 phần:  
     - 30% đánh dấu là “sẵn sàng claim” cho investor (sẽ được mint lần lượt khi từng người gọi hàm claim).  
     - 40% chuyển sang `TokenVesting` để khoá cho team dev/advisor theo lịch cliff + linear.  
     - 30% giữ lại trong `TokenSale` để dùng cho bước add liquidity.

3. **Tự động add liquidity trên Uniswap v2:**  
   - `TokenSale` dùng 30% VNDC cùng **toàn bộ lượng ETH còn lại trong contract** để gọi router của Uniswap v2, tạo pool VNDC/ETH theo cơ chế của DEX.  
   - Hợp đồng nhận về LP token đại diện quyền sở hữu pool này, nhưng code không cung cấp bất kỳ hàm withdraw LP nào → về bản chất, thanh khoản được khoá lâu dài, đội ngũ không thể rút pool để rug pull.  

4. **Investor claim & stake, team nhận vesting:**  
   - Sau khi finalize xong và pool đã được tạo, investor lần lượt gọi hàm `claim` để nhận VNDC của mình và có thể gửi ngay vào `StakingContract` để nhận thêm reward thay vì bán ra ngay.  
   - Đồng thời, `TokenVesting` bắt đầu release token dần dần cho team theo lịch, tránh tình huống team xả mạnh ngay sau khi list, giúp giá VNDC ổn định hơn trong trung và dài hạn.

**Góc nhìn về giá & triết lý “fair launch”:**  
- Với cách chia 30% cho investor, 30% cho liquidity và 40% cho team, đồng thời dùng toàn bộ ETH raise được để bơm liquidity, **giá VNDC trên DEX tại thời điểm list sẽ xấp xỉ giá ICO hiệu quả** (không có cú pump nhân N lần ngay khi niêm yết).  
- Đây là chủ đích thiết kế: dự án ưu tiên an toàn và minh bạch, tập trung vào việc:
  - Khóa LP on-chain, loại bỏ khả năng rút pool để rug pull.  
  - Vesting chặt chẽ token của team/advisor để tránh xả mạnh.  
  - Cung cấp staking như một utility ngay từ đầu, giúp nhà đầu tư có lựa chọn “gửi tiết kiệm” thay vì bắt buộc phải xả ngắn hạn.  
- Thay vì hứa hẹn xN lần ngay khi list, dự án chọn hướng **fair launch + bảo vệ**, tạo nền tảng giá ổn định để xây dựng thêm utility và thu hút dòng tiền thật về dài hạn.

**Deployment & Security Practice:**  
- Công cụ: Solidity + OpenZeppelin, Hardhat (Mocha/Chai), Sophia Network RPC.  
- Bảo mật: sử dụng Ownable/Pausable/ReentrancyGuard/SafeERC20, phân quyền rõ ràng, hạn chế external call nguy hiểm.  
- Đánh giá: correctness (unit test), security (reentrancy, overflow/underflow), performance (gas cost), usability (demo với MetaMask).  
- Script deploy 00–07 chạy tuần tự, log rõ ràng giúp trace khi demo.

---

## 3. EXPERIMENTS AND RESULTS

**Experiment Setting (8 bước cụ thể):**  
1. Deploy VNDC, chuyển quyền mint cho TokenSale.  
2. Deploy TokenSale với soft cap 50 ETH, hard cap 200 ETH, fixed price.  
3. Deploy TokenVesting cho team/advisor, cấu hình cliff + linear.  
4. Deploy StakingContract, kết nối VNDC, thiết lập tier và reward pool.  
5. Deploy Uniswap v2 factory/router mô phỏng trên Hardhat.  
6. Mô phỏng ICO thành công với 5 investor gửi tổng 50 ETH.  
7. Gọi finalize: TokenSale mint và phân bổ 30/40/30, tự động add liquidity VNDC/ETH.  
8. Investor claim token, stake; vesting release đúng lịch; TokenSale giữ LP token.  
- Nhấn mạnh automation: chạy `yarn hardhat deploy` ~1.78s hoàn thành toàn pipeline.

**Unit Test & Deploy Metrics:**  
- `TokenSale.test.ts`: 20 test case pass, kiểm tra finalize, phân bổ 30/30/40, tạo pair VNDC/WETH, nghiệm thu việc revert khi soft cap chưa đạt.  
- Deploy script 07: mô phỏng 5 buyer, auto finalize, verify cặp VNDC/WETH tồn tại và LP token nằm trong TokenSale.  
- Gas tổng pipeline ~20.1M (25 Gwei, ETH 3,000 USD → ~750 USD). Chia sẻ chi phí giúp đánh giá tính khả thi mainnet/testnet.

**Stress-scenario Validation (Giải thích):**  
1. *Flash Dump Panic*: khi thị trường bán tháo, 40% token bị khóa vesting và phần lớn stake, hệ thống kích hoạt “dynamic APY boost” để khuyến khích holder khóa lại token → giảm áp lực bán.  
2. *Liquidity Withdrawal Mitigation*: vì LP token nằm trong TokenSale, mọi nỗ lực `removeLiquidity` đều revert; demo Hardhat chứng minh kẻ xấu không thể rút thanh khoản.  
3. *Reward Drain Attempt*: attacker cố unstake sớm để lấy reward; hợp đồng chỉ trả principal (gốc), reward vẫn ở contract → tránh drain.  
- Kết luận: kết hợp TokenSale-only-mint + vesting + staking lock tiers tạo buffer chống dump và bảo vệ giá.

---

## 4. APPENDICES – PROJECT PLANNING

**Timeline Chi Tiết:**  
- Tuần 1 – Phân tích & thiết kế: tổng hợp yêu cầu, chốt thiết kế token + vesting.  
- Tuần 2 – TokenSale & Auto-LP: viết hợp đồng mới, chuyển quyền mint, tích hợp logic 30/30/40, kiểm tra với router.  
- Tuần 3 – Staking & Unit Test: build StakingContract, nạp reward pool, viết 20 test cho TokenSale.  
- Tuần 4 – Scripts & Stress: hoàn thiện scripts deploy 00–07, chạy 3 stress scenario, cập nhật báo cáo (đang thực hiện).  
- Tuần 5 – Demo & Slide: dự kiến deploy testnet Sophia/BNB, thu thập log, chuẩn bị slide (chưa thực hiện).

**Call to Action & Needs:**  
- Cần feedback về logic auto-liquidity 30/30/40 và cơ chế dynamic APY để chốt trước demo.  
- Đề nghị xác nhận slot demo tuần 5, hỗ trợ môi trường RPC Sophia/BNB.  
- Mong thầy góp ý thêm về các tiêu chí audit bảo mật để đưa vào report final.

---

## PHẦN 2: TỪ ĐIỂN KHÁI NIỆM (CONCEPTS)

| Khái niệm | Giải thích đơn giản |
| --- | --- |
| **ERC-20** | Tiêu chuẩn kỹ thuật chung cho token trên Ethereum; giống tiêu chuẩn USB giúp token tương thích với mọi ví/sàn. |
| **ICO (Token Sale)** | Đợt mở bán token đầu tiên để gọi vốn. Người dùng gửi ETH, hệ thống ghi nhận số token tương ứng. |
| **Soft Cap / Hard Cap** | Soft cap: mức vốn tối thiểu (50 ETH). Nếu không đạt sẽ hoàn tiền. Hard cap: mức tối đa (200 ETH); đạt là dừng bán ngay. |
| **Liquidity (Thanh khoản)** | Khả năng đổi token sang tiền mặt. Dự án tạo pool VNDC/ETH trên Uniswap để mọi người mua bán tự do. |
| **LP Token** | “Biên lai” chứng nhận sở hữu pool thanh khoản. Ai giữ LP token có quyền rút tiền trong pool. Trong dự án, LP token bị khóa để chống rug pull. |
| **Vesting** | Cơ chế trả token theo thời gian. Ví dụ team có 1M token nhưng nhận dần mỗi tháng trong 2 năm thay vì nhận ngay. |
| **Staking** | Giống gửi tiết kiệm: người dùng khóa token vào contract, sau thời gian sẽ nhận lại gốc + lãi (reward). |
| **Cliff** | Thời gian chờ trong vesting. Ví dụ cliff 6 tháng nghĩa là 6 tháng đầu chưa nhận token nào. |
| **Dynamic APY Boost** | Cơ chế tăng lãi suất staking tạm thời khi TVL giảm >10% để giữ chân holder. |
| **Auto-Liquidity 30/30/40** | Chiến lược phân bổ token sau ICO: 30% cho investor claim, 40% chuyển vào vesting, 30% dùng để bơm thanh khoản VNDC/ETH. |

---

## CLOSING SCRIPT

“Tóm lại, nhóm đã hoàn thiện bộ hợp đồng và pipeline auto-liquidity 30/30/40, xác thực bằng 20 unit test và 3 kịch bản stress. Tuần tới chúng em tập trung finalize scripts, chuẩn bị demo trên testnet và rà soát bảo mật. Rất mong nhận phản hồi thêm để tối ưu giải pháp. Em xin cảm ơn.”

