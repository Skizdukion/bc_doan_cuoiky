# VNDC ICO-READY ERC-20 – DEBATE QUESTIONS & PROPOSED ANSWERS

File này tổng hợp các câu hỏi phản biện (debate) cho buổi bảo vệ, kèm theo gợi ý trả lời ngắn gọn, có thể đọc thành script.

---

## 1. Tokenomics & Giá

**Q1. Với cơ chế fair launch (giá DEX ban đầu ≈ giá ICO), dự án còn đủ hấp dẫn với nhà đầu tư “muốn xN lần” ngay khi list không?**  
**A (đề xuất):**  
- Bọn em cố tình không thiết kế “pump xN ngay khi list” vì đó là gốc rễ của rất nhiều vụ rug pull / pump & dump.  
- Thay vào đó, dự án nhấn mạnh 3 điểm:  
  1. Thanh khoản bị khóa on-chain, không rút được.  
  2. Team/advisor bị vesting, không xả mạnh.  
  3. Nhà đầu tư có staking để kiếm thêm reward nếu hold lâu dài.  
- Về mặt học thuật, mục tiêu của đề tài là một **pipeline ICO an toàn & minh bạch**, chứ không phải tối ưu FOMO ngắn hạn. Giá tăng về sau sẽ đến từ utility và nhu cầu thực, không phải từ setup tokenomics méo mó ngay lúc listing.

---

**Q2. Tỷ lệ 30% investor – 30% liquidity – 40% team có tối ưu không? Sao không chọn 40/20/40 hoặc 35/25/40?**  
**A (đề xuất):**  
- 30/30/40 là một điểm cân bằng đơn giản để:  
  - Đảm bảo đủ thanh khoản ban đầu (30%) để giảm trượt giá khi mua/bán.  
  - Đảm bảo team có đủ “skin in the game” (40%) nhưng bị khóa vesting.  
  - Đảm bảo investor có allocation rõ ràng (30%) và có thêm staking.  
- Nếu tăng phần investor và giảm liquidity (ví dụ 40/20/40), giá có thể pump mạnh hơn nhưng độ sâu thanh khoản kém, dễ dẫn tới biến động quá lớn.  
- Nếu cần tối ưu cho một use case cụ thể (ví dụ game, DeFi…), có thể tinh chỉnh lại tỷ lệ; kiến trúc contract vẫn giữ nguyên, chỉ đổi tham số BPS.

---

**Q3. Tại sao lại đưa toàn bộ ETH raise được vào LP, không giữ lại treasury cho marketing, listing CEX, phát triển tiếp?**  
**A (đề xuất):**  
- Lý do chính là **tính minh bạch**: toàn bộ ETH raise được đều on-chain trong LP, ai cũng kiểm tra được, không có quỹ “mù” off-chain khó kiểm soát.  
- Dưới góc độ học thuật, đây là một extreme case để minh chứng mô hình **LP-locked 100% vốn raise**.  
- Ở môi trường production, dự án thực tế thường trích một phần ETH làm treasury; kiến trúc hiện tại cho phép điều chỉnh dễ dàng (chỉ cần không dùng toàn bộ `address(this).balance` khi add liquidity).  
- Bọn em có thể mở rộng trong “Future Work” rằng: phiên bản V2 sẽ tách một phần ETH làm treasury và mô phỏng lại các kịch bản giá.

---

## 2. Bảo mật & Thiết kế Contract

**Q4. Quyền lực tập trung ở owner của `TokenSale` như vậy có rủi ro gì? Nếu private key owner bị lộ thì sao?**  
**A (đề xuất):**  
- Hiện tại owner có quyền: start/end sale, finalize, set router, set vesting – tức là khá tập trung.  
- Đây là trade-off giữa **đơn giản** và **phi tập trung** trong phạm vi bài tập lớn; bọn em ưu tiên tính dễ hiểu và test được.  
- Nếu triển khai thực tế, nên dùng **multisig** cho owner (ví dụ Gnosis Safe) hoặc chuyển dần qua cơ chế governance để giảm rủi ro single key.  
- Điểm chính: code đã tách rõ các hành động quan trọng (finalize, add liquidity, vesting), nên rất dễ audit và gắn vào multisig ở phiên bản sau.

---

**Q5. LP token bị khóa trong `TokenSale` (không có hàm rút) – vậy nếu sau này muốn di chuyển thanh khoản sang chain khác hoặc DEX khác thì sao?**  
**A (đề xuất):**  
- Đây là một quyết định **cực kỳ bảo thủ** về mặt bảo vệ nhà đầu tư: once locked, always locked.  
- Nhược điểm là dự án không thể chủ động di chuyển LP, đúng là mất đi một phần linh hoạt.  
- Trong thực tế, có thể thiết kế cơ chế:  
  - Chỉ cho phép rút LP thông qua multisig + timelock, hoặc  
  - Có cơ chế migrate liquidity qua V2 pool, được công bố minh bạch từ đầu.  
- Trong phạm vi đề tài, bọn em chọn phương án “no withdraw” để mô hình rõ ràng về mặt bảo mật, rồi ghi rõ phần này như một **limitation** trong báo cáo.

---

**Q6. Cơ chế mint on-demand khi claim (`token.mint(msg.sender, amount)`) có an toàn không? Có giới hạn tổng cung ở đâu không?**  
**A (đề xuất):**  
- Việc mint chỉ được phép thông qua `TokenSale`, và chỉ dựa trên `purchasedTokens[msg.sender]` đã được tính toán trong giai đoạn sale.  
- Tổng cung được gián tiếp giới hạn bởi `totalTokensSold` và các tỷ lệ BPS 30/30/40 – không có hàm mint tùy ý khác cho owner hay bất kỳ address nào.  
- Nếu cần an toàn hơn nữa, có thể thêm một `MAX_SUPPLY` bên trong VNDC và assert rằng tổng supply sau mỗi lần mint không vượt quá ngưỡng đó. Đây là một cải tiến dễ bổ sung trong phiên bản tiếp theo.

---

## 3. Vesting & Staking

**Q7. Tham số vesting hiện tại có cân bằng giữa bảo vệ nhà đầu tư và tạo động lực cho team không? Nếu bear market kéo dài thì team có bị trói tay quá không?**  
**A (đề xuất):**  
- Vesting được thiết kế theo kiểu cliff + linear để:  
  - Trong giai đoạn đầu, team không thể xả, gửi tín hiệu cam kết cho nhà đầu tư.  
  - Về sau, token unlock dần, giúp team có dòng cashflow hợp lý để vận hành.  
- Đúng là nếu bear market kéo dài, team có thể cảm thấy “trói tay”; tuy nhiên đó là câu chuyện cân bằng quyền lợi – nhà đầu tư cũng cần được bảo vệ khỏi khả năng team bỏ dự án.  
- Trong thực tế, tham số cụ thể (thời gian cliff, độ dài linear) nên được điều chỉnh theo từng dự án; kiến trúc vesting hiện tại đủ linh hoạt để đổi schedule mà không đổi code.

---

**Q8. Làm sao đảm bảo lạm phát từ staking không vượt quá 10%/năm? Đã có mô phỏng dài hạn chưa?**  
**A (đề xuất):**  
- Reward pool staking được nạp thủ công, không auto-beaming từ mint, nên nhóm hoàn toàn kiểm soát tổng lượng token thưởng đưa vào hệ thống.  
- Trong bài, bọn em ước tính sơ bộ dựa trên: TVL dự kiến, APY mục tiêu và thời gian khóa; từ đó tính ra lượng token cần nạp vào pool cho một năm.  
- Chưa có mô phỏng 3–5 năm thực sự chi tiết – đây là điểm bọn em thừa nhận là **future work**: có thể dùng script để simulate nhiều chu kỳ stake/unstake khác nhau và kiểm soát chặt hơn mục tiêu 10%.

---

**Q9. Dynamic APY boost khi TVL giảm >10% có thể bị game không? Ví dụ user cố tình unstake để kích hoạt APY cao rồi vào lại?**  
**A (đề xuất):**  
- Về lý thuyết, có khả năng xuất hiện kiểu “APY hunting”: rút bớt để làm giảm TVL rồi stake lại.  
- Để hạn chế, có vài hướng:  
  - Thêm **cooldown** cho việc thay đổi APY, không cho điều chỉnh quá thường xuyên.  
  - Áp dụng **lock-in period** khi APY boost đang bật (unstake sớm bị phạt).  
  - Chỉ tính TVL baseline theo trung bình trượt (moving average), không dựa trên một thời điểm duy nhất.  
- Trong phạm vi đề tài, bọn em tập trung chứng minh khái niệm “dynamic APY” và sẽ ghi rõ rủi ro game-theory này như một hướng tối ưu trong tương lai.

---

## 4. UX, Vận hành & Tuân thủ

**Q10. User journey (gửi ETH → chờ kết thúc sale → claim → stake) có quá nhiều bước không? Người dùng phổ thông có bị rối không?**  
**A (đề xuất):**  
- Đúng là với người mới, 3–4 bước on-chain có thể hơi phức tạp.  
- Tuy nhiên, bọn em cố ý giữ từng bước tách biệt để:  
  - Dễ test, dễ audit từng hàm một.  
  - Cho phép thêm UI wrapper phía ngoài (web dApp) gom các bước thành 1–2 click.  
- Trong triển khai thực tế, front-end có thể “gói” flow này lại: sau khi sale kết thúc, UI tự check trạng thái, gợi ý user claim + stake trong cùng một wizard.

---

**Q11. Nếu mạng tắc (gas cao, delay) tại thời điểm finalize hoặc add liquidity, có nguy cơ kẹt sale hoặc ảnh hưởng tới một số user claim trễ không?**  
**A (đề xuất):**  
- Finalize và add liquidity là các bước on-chain bình thường, nên vẫn chịu ảnh hưởng của tình trạng mạng.  
- Tuy nhiên, trạng thái được lưu on-chain, nên dù giao dịch pending lâu thì khi nó được confirm, mọi user đều đọc cùng một state, không có “race condition” giữa các investor.  
- Trong thực tế, có thể thêm:  
  - Cảnh báo thời gian/gas trong UI.  
  - Một cơ chế “emergency pause/unpause” có kiểm soát để xử lý nếu mạng gặp sự cố nghiêm trọng.

---

**Q12. Về pháp lý, việc nhận ETH trực tiếp vào TokenSale có cần KYC/AML không? Hệ thống whitelist hiện tại đủ chưa?**  
**A (đề xuất):**  
- Hợp đồng đã hỗ trợ whitelist on-chain, nhưng chưa gắn với hệ thống KYC off-chain cụ thể – vì đây là phạm vi vượt quá đề tài kỹ thuật.  
- Trong bối cảnh sản phẩm học thuật/PoC, bọn em tập trung chứng minh tính đúng đắn on-chain; còn KYC/AML sẽ được xem là **integration layer bên ngoài**.  
- Ở môi trường production, TokenSale cần kết hợp với một backend KYC service, chỉ thêm địa chỉ đã KYC vào whitelist; đây là một phần bọn em đề xuất trong “Future Work”.

---

## 5. Mở rộng & Nâng cấp

**Q13. Không dùng proxy / upgradeable contract – nếu sau này phát hiện bug thì làm sao nâng cấp?**  
**A (đề xuất):**  
- Không dùng proxy giúp code đơn giản, dễ audit, phù hợp cho mục tiêu giảng dạy và hạn chế lớp phức tạp mới (storage layout, admin proxy…).  
- Nếu phát hiện bug, chiến lược thực tế là deploy V2 contract và cung cấp cơ chế migration (ví dụ cho phép user claim lại trên V2 dựa trên snapshot state của V1).  
- Trong báo cáo, bọn em ghi rõ đây là trade-off: ưu tiên tính đơn giản, còn khả năng upgrade sẽ được xem là hướng phát triển tiếp theo.

---

**Q14. Nếu muốn triển khai trên mainnet (Ethereum/BSC), cần điều chỉnh những gì? Kiến trúc hiện tại có đủ linh hoạt không?**  
**A (đề xuất):**  
- Về kiến trúc, phần lớn logic vẫn dùng được: ERC‑20, TokenSale, Vesting, Staking, auto-LP.  
- Cần tune lại:  
  - `TOKEN_PRICE`, min/max purchase, soft/hard cap cho phù hợp mặt bằng giá thực.  
  - Tham số staking (APY, thời gian khóa).  
  - Hệ số gas (cân nhắc tối ưu thêm để phí không quá cao).  
- Như vậy, bọn em cho rằng kiến trúc hiện tại **đủ “ICO‑ready” về mặt kỹ thuật**, nhưng để production cần thêm 3 lớp nữa: tối ưu gas, KYC/AML, và cơ chế governance/multisig cho quyền admin.

---

## Kết luận Debate

- Về mặt kỹ thuật, dự án đã cung cấp một **pipeline ERC‑20 ICO‑ready** với: TokenSale + Vesting + Staking + Auto‑Liquidity + Script deploy + Test + Stress tests.  
- Tuy nhiên, tokenomics, governance và vận hành thực tế vẫn còn nhiều điểm có thể tranh luận và cải thiện – đó là lý do bọn em chủ động liệt kê các câu hỏi phản biện này trong phần “Limitations & Future Work”, chứng minh rằng nhóm có nhìn nhận đầy đủ về rủi ro và hướng phát triển tiếp theo.  


