package com.example.ventaslobostore.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.example.ventaslobostore.databinding.ItemArticleAdminBinding
import com.example.ventaslobostore.model.Article

class AdminArticleAdapter(
    private var articles: List<Article>,
    private val onEdit: (Article) -> Unit,
    private val onDelete: (Article) -> Unit
) : RecyclerView.Adapter<AdminArticleAdapter.AdminViewHolder>() {

    class AdminViewHolder(val binding: ItemArticleAdminBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AdminViewHolder {
        val binding = ItemArticleAdminBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return AdminViewHolder(binding)
    }

    override fun onBindViewHolder(holder: AdminViewHolder, position: Int) {
        val article = articles[position]
        holder.binding.tvName.text = article.name
        holder.binding.tvPrice.text = "$${article.price}"

        Glide.with(holder.itemView.context)
            .load(article.imageUrl)
            .placeholder(android.R.drawable.ic_menu_report_image)
            .into(holder.binding.ivArticle)

        holder.binding.btnEdit.setOnClickListener { onEdit(article) }
        holder.binding.btnDelete.setOnClickListener { onDelete(article) }
    }

    override fun getItemCount() = articles.size

    fun updateArticles(newArticles: List<Article>) {
        articles = newArticles
        notifyDataSetChanged()
    }
}
