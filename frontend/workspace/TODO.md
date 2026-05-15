<instructions>
This file powers chat suggestion chips. Keep it focused and actionable.

# Be proactive
- Suggest ideas and things the user might want to add *soon*. 
- Important things the user might be overlooking (SEO, more features, bug fixes). 
- Look specifically for bugs and edge cases the user might be missing (e.g., what if no user has logged in).

# Rules
- Each task must be wrapped in a "<todo id="todo-id">" and "</todo>" tag pair.
- Inside each <todo> block:
  - First line: title (required)
  - Second line: description (optional)
- The id must be a short stable identifier for the task and must not change when you rewrite the title or description.
- You should proactively review this file after each response, even if the user did not explicitly ask, maintain it if there were meaningful changes (new requirement, task completion, reprioritization, or stale task cleanup).
- Think BIG: suggest ambitious features, UX improvements, technical enhancements, and creative possibilities.
- Balance quick wins with transformative ideas — include both incremental improvements and bold new features.
- Aim for 3-5 high-impact tasks that would genuinely excite the user.
- Tasks should be specific enough to act on, but visionary enough to inspire.
- Remove or rewrite stale tasks when completed, obsolete, or clearly lower-priority than current work.
- Re-rank by impact and user value, not just urgency.
- Draw inspiration from the project's existing features — what would make them 10x better?
- Don't be afraid to suggest features the user hasn't explicitly mentioned.
</instructions>

<todo id="arcium-deploy">
Deploy circuits + program to devnet
Run `arcium deploy` then `anchor deploy` on devnet, set real program ID in declare_id!
</todo>

<todo id="arcium-deposit-flow">
Wire up real USDC deposit with SPL token transfer
Currently deposit is a no-op — implement vault token account creation + airdrop helpers for tests
</todo>


<todo id="pnl-persistence">
Persist live PnL to SDK
The LivePnL component currently ticks locally — periodically sync the computed PnL back to the SDK Position record
</todo>

<todo id="sdk-wallet-auth">
Link wallet address to SDK user
After wallet connect, call SDK login() and associate the wallet address with the SDK user for true owner verification
</todo>
