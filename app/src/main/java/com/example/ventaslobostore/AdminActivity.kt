package com.example.ventaslobostore

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.ventaslobostore.adapter.AdminArticleAdapter
import com.example.ventaslobostore.adapter.OrderAdapter
import com.example.ventaslobostore.databinding.ActivityAdminBinding
import com.example.ventaslobostore.databinding.DialogAddArticleBinding
import com.example.ventaslobostore.model.Article
import com.example.ventaslobostore.model.Order
import com.example.ventaslobostore.repository.ArticleRepository
import com.google.android.material.tabs.TabLayoutMediator
import kotlinx.coroutines.launch

class AdminActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAdminBinding
    private val repository = ArticleRepository()
    private lateinit var articleAdapter: AdminArticleAdapter
    private lateinit var orderAdapter: OrderAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAdminBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupUI()
    }

    private fun setupUI() {
        setupRecyclerViews()
        
        binding.btnAddArticle.setOnClickListener {
            showArticleDialog(null)
        }

        // Handle FAB visibility based on tab
        binding.viewPagerAdmin.registerOnPageChangeCallback(object : androidx.viewpager2.widget.ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) {
                if (position == 0) {
                    binding.btnAddArticle.show()
                    loadArticles()
                } else {
                    binding.btnAddArticle.hide()
                    loadOrders()
                }
            }
        })

        loadArticles()
    }

    private fun setupRecyclerViews() {
        articleAdapter = AdminArticleAdapter(
            emptyList(),
            onEdit = { article -> showArticleDialog(article) },
            onDelete = { article -> deleteArticle(article) }
        )
        
        orderAdapter = OrderAdapter(
            emptyList(),
            onStatusClick = { order -> showStatusDialog(order) },
            onDeleteClick = { order -> deleteOrder(order) }
        )

        binding.viewPagerAdmin.adapter = object : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
            override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
                val rv = RecyclerView(parent.context).apply {
                    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                    layoutManager = LinearLayoutManager(parent.context)
                }
                return object : RecyclerView.ViewHolder(rv) {}
            }

            override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
                val rv = holder.itemView as RecyclerView
                rv.adapter = if (position == 0) articleAdapter else orderAdapter
            }

            override fun getItemCount() = 2
        }

        TabLayoutMediator(binding.tabLayoutAdmin, binding.viewPagerAdmin) { tab, position ->
            tab.text = if (position == 0) "PRODUCTOS" else "PEDIDOS"
        }.attach()
    }

    private fun loadArticles() {
        lifecycleScope.launch {
            val articles = repository.getArticles()
            articleAdapter.updateArticles(articles)
        }
    }

    private fun loadOrders() {
        lifecycleScope.launch {
            val orders = repository.getOrders()
            orderAdapter.updateOrders(orders)
        }
    }

    private fun showArticleDialog(article: Article?) {
        val dialogBinding = DialogAddArticleBinding.inflate(LayoutInflater.from(this))
        val builder = AlertDialog.Builder(this, R.style.Theme_VENTASLOBOSTORE_Dialog)
            .setView(dialogBinding.root)
            .setTitle(if (article == null) "Agregar Artículo" else "Editar Artículo")

        article?.let {
            dialogBinding.etName.setText(it.name)
            dialogBinding.etPrice.setText(it.price.toString())
            dialogBinding.etDescription.setText(it.description)
            dialogBinding.etImageUrl.setText(it.imageUrl)
            dialogBinding.etStock.setText(it.stock.toString())
        }

        builder.setPositiveButton("Guardar") { _, _ ->
            val name = dialogBinding.etName.text.toString()
            val price = dialogBinding.etPrice.text.toString().toDoubleOrNull() ?: 0.0
            val description = dialogBinding.etDescription.text.toString()
            val imageUrl = dialogBinding.etImageUrl.text.toString()
            val stock = dialogBinding.etStock.text.toString().toIntOrNull() ?: 0

            val newArticle = Article(
                id = article?.id,
                name = name,
                price = price,
                description = description,
                imageUrl = imageUrl,
                stock = stock
            )

            lifecycleScope.launch {
                if (article == null) {
                    repository.addArticle(newArticle)
                } else {
                    repository.updateArticle(newArticle)
                }
                loadArticles()
                Toast.makeText(this@AdminActivity, "Artículo guardado", Toast.LENGTH_SHORT).show()
            }
        }
        builder.setNegativeButton("Cancelar", null)
        builder.show()
    }

    private fun deleteArticle(article: Article) {
        article.id?.let { id ->
            AlertDialog.Builder(this, R.style.Theme_VENTASLOBOSTORE_Dialog)
                .setTitle("Eliminar Artículo")
                .setMessage("¿Estás seguro de que quieres eliminar este artículo?")
                .setPositiveButton("Sí") { _, _ ->
                    lifecycleScope.launch {
                        repository.deleteArticle(id)
                        loadArticles()
                    }
                }
                .setNegativeButton("No", null)
                .show()
        }
    }

    private fun showStatusDialog(order: Order) {
        val statuses = arrayOf("PENDIENTE", "EN PROCESO", "COMPRADO", "CANCELADO")
        AlertDialog.Builder(this, R.style.Theme_VENTASLOBOSTORE_Dialog)
            .setTitle("Actualizar Estado")
            .setItems(statuses) { _, which ->
                val newStatus = statuses[which]
                lifecycleScope.launch {
                    order.id?.let { id ->
                        // Lógica de descuento de stock si es COMPRADO
                        if (newStatus == "COMPRADO") {
                            val productId = order.productId
                            if (productId != null) {
                                val article = repository.getArticle(productId)
                                article?.let { art ->
                                    val buyQty = order.quantity
                                    if (art.stock >= buyQty) {
                                        val newStock = art.stock - buyQty
                                        repository.updateArticle(art.copy(stock = newStock))
                                        Toast.makeText(this@AdminActivity, "Stock descontado: -$buyQty", Toast.LENGTH_SHORT).show()
                                    } else {
                                        Toast.makeText(this@AdminActivity, "Atención: Stock insuficiente", Toast.LENGTH_LONG).show()
                                    }
                                }
                            }
                        }
                        
                        repository.updateOrderStatus(id, newStatus)
                        loadOrders()
                        Toast.makeText(this@AdminActivity, "Estado actualizado a $newStatus", Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .show()
    }

    private fun deleteOrder(order: Order) {
        order.id?.let { id ->
            AlertDialog.Builder(this, R.style.Theme_VENTASLOBOSTORE_Dialog)
                .setTitle("Eliminar Pedido")
                .setMessage("¿Eliminar este registro de pedido?")
                .setPositiveButton("Sí") { _, _ ->
                    lifecycleScope.launch {
                        repository.deleteOrder(id)
                        loadOrders()
                    }
                }
                .setNegativeButton("No", null)
                .show()
        }
    }
}
