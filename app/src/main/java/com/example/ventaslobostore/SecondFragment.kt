package com.example.ventaslobostore

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.bumptech.glide.Glide
import com.example.ventaslobostore.databinding.DialogOrderInfoBinding
import com.example.ventaslobostore.databinding.FragmentSecondBinding
import com.example.ventaslobostore.model.Article
import com.example.ventaslobostore.model.Order
import com.example.ventaslobostore.repository.ArticleRepository
import kotlinx.coroutines.launch
import java.net.URLEncoder

class SecondFragment : Fragment() {

    private var _binding: FragmentSecondBinding? = null
    private val binding get() = _binding!!
    private val repository = ArticleRepository()
    private var currentArticle: Article? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSecondBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val articleId = arguments?.getString("articleId")
        articleId?.let { loadArticle(it) }

        binding.btnBuy.setOnClickListener {
            currentArticle?.let { article ->
                showOrderInfoDialog(article)
            }
        }
    }

    private fun loadArticle(id: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            val article = repository.getArticle(id)
            currentArticle = article
            article?.let {
                binding.tvNameDetail.text = it.name
                binding.tvPriceDetail.text = "$${it.price}"
                binding.tvDescriptionDetail.text = it.description
                Glide.with(requireContext())
                    .load(it.imageUrl)
                    .placeholder(android.R.drawable.ic_menu_report_image)
                    .into(binding.ivArticleDetail)
            }
        }
    }

    private fun showOrderInfoDialog(article: Article) {
        val dialogBinding = DialogOrderInfoBinding.inflate(LayoutInflater.from(requireContext()))
        AlertDialog.Builder(requireContext(), R.style.Theme_VENTASLOBOSTORE_Dialog)
            .setTitle("Confirmar Pedido")
            .setView(dialogBinding.root)
            .setPositiveButton("Finalizar por WhatsApp") { _, _ ->
                val name = dialogBinding.etCustomerName.text.toString()
                val phone = dialogBinding.etCustomerPhone.text.toString()
                val qtyString = dialogBinding.etCustomerQuantity.text.toString()
                val quantity = qtyString.toIntOrNull() ?: 1
                
                if (name.isNotEmpty() && phone.isNotEmpty()) {
                    val totalPrice = article.price * quantity
                    val order = Order(
                        username = name,
                        phone = phone,
                        name = article.name,
                        price = article.price,
                        imageUrl = article.imageUrl,
                        productId = article.id,
                        quantity = quantity,
                        totalPrice = totalPrice,
                        description = article.description,
                        category = article.category
                    )
                    
                    lifecycleScope.launch {
                        repository.addOrder(order)
                        sendWhatsAppMessage(order)
                    }
                } else {
                    Toast.makeText(requireContext(), "Por favor ingresa tus datos", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun sendWhatsAppMessage(order: Order) {
        val phoneNumber = "5216681431491"
        val message = """
            🐺 *NUEVO PEDIDO - VENTAS LOBO STORE* 🐺
            
            *Cliente:* ${order.username}
            *Teléfono:* ${order.phone}
            
            *Producto:* ${order.name}
            *Cantidad:* ${order.quantity}
            *Precio Unitario:* $${order.price}
            *TOTAL:* $${order.totalPrice}
            
            *Foto del Producto:*
            ${order.imageUrl}
            
            Hola, soy ${order.username}. Acabo de realizar este pedido desde la app.
        """.trimIndent()

        try {
            val intent = Intent(Intent.ACTION_VIEW)
            val url = "https://api.whatsapp.com/send?phone=$phoneNumber&text=" + URLEncoder.encode(message, "UTF-8")
            intent.data = Uri.parse(url)
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(requireContext(), "WhatsApp no está instalado", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
