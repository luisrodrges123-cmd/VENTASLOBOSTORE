package com.example.ventaslobostore.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.example.ventaslobostore.databinding.ItemArticleBinding
import com.example.ventaslobostore.model.Article

class ArticleAdapter(
    private var articles: List<Article>,
    private val onArticleClick: (Article) -> Unit
) : RecyclerView.Adapter<ArticleAdapter.ArticleViewHolder>() {

    class ArticleViewHolder(val binding: ItemArticleBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ArticleViewHolder {
        val binding = ItemArticleBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ArticleViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ArticleViewHolder, position: Int) {
        val article = articles[position]
        holder.binding.articleName.text = article.name.uppercase()
        holder.binding.articlePrice.text = "CRÉDITOS: ${article.price}"
        holder.binding.articleDescription.text = "SINC: ${article.description.take(20)}..."

        Glide.with(holder.itemView.context)
            .load(article.imageUrl)
            .centerCrop()
            .into(holder.binding.articleImage)

        // Add a small futuristic touch: scale up on click
        val clickListener = {
            holder.itemView.animate().scaleX(0.95f).scaleY(0.95f).setDuration(100).withEndAction {
                holder.itemView.animate().scaleX(1.0f).scaleY(1.0f).setDuration(100).start()
                onArticleClick(article)
            }.start()
        }

        holder.itemView.setOnClickListener { clickListener() }
        holder.binding.btnViewDetails.setOnClickListener { clickListener() }
    }

    override fun getItemCount() = articles.size

    fun updateArticles(newArticles: List<Article>) {
        articles = newArticles
        notifyDataSetChanged()
    }
}
