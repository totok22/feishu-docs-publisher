---
论文pdf: "[[paper.pdf]]"
---
# Obsidian Export Test

## 1. Inline Formula
Policy gradient: $\nabla_\theta J(\theta)$

## 2. Block Formula
$$
\nabla_\theta J(\theta)
=
\mathbb{E}\left[
A_t \nabla_\theta
\log \pi_\theta(a_t|s_t)
\right]
$$

## 3. Callout
> [!NOTE]- Benchmark 简介
> 这是一个可以折叠的 Callout。
>
> **重要信息**：测试加粗格式。
>
> - Item A
>   - Nested item
> - Item B
>
> > [!TIP]+ 嵌套提示
> > 保留嵌套正文。

## 4. PDF++ Reference
> [!PDF|yellow] [[paper.pdf#page=3&selection=17,0,18,63&color=yellow|Paper, p.3]]
> This is a highlighted passage from the paper.

## 5. PDF WikiLink
论文：[paper.pdf](paper.pdf)

Obsidian 引用：[[paper.pdf]]

[[paper.pdf#page=3]]

[[paper.pdf#page=3|Paper, p.3]]

## 6. Table
| Method | Accuracy |
|---|---:|
| PPO | 65.2 |
| GRPO | 68.4 |

## 7. Code
```python
def policy_gradient(log_prob, advantage):
    return -(log_prob * advantage).mean()
```

```markdown
> [!NOTE]- Literal example
[[paper.pdf#page=9]]
```

Inline example: `[[paper.pdf]]`.

## 8. Highlight
这是一个 ==重要结论==。

这是一个 <mark>HTML 高亮</mark>。

## 9. WikiLinks
[[PPO]]

[[PPO|Policy Optimization]]

## 10. Mermaid
```mermaid
flowchart LR
    Obsidian --> Parser --> Feishu
```

## 11. Image and footnote
![[diagram.png|320]]

科研结论[^paper]。

[^paper]: A paper reference.
