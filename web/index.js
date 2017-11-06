(function(document) {
	$(document).ready(ready);
	$(window).on("resize", ready);
	
	var e_query = document.getElementById("query");
	var e_namespace = document.getElementById("namespace");
	var e_automated = document.getElementById("automated");
	var e_official = document.getElementById("official");
	var e_order = document.getElementById("order");
	var e_search = document.getElementById("search");
	var e_results_count = document.getElementById("results_count");
	var e_progress = document.getElementById("progress");
	var e_results = document.getElementById("results");
	var e_description = document.getElementById("description");

	var SORT_NONE = -1,
		SORT_NAMESPACE_UP = 0,
		SORT_NAMESPACE_DOWN = 1,
		SORT_REPOSITORY_UP = 2,
		SORT_REPOSITORY_DOWN = 3,
		SORT_AMD64_UP = 4,
		SORT_AMD64_DOWN = 5,
		SORT_ARM_UP = 6,
		SORT_ARM_DOWN = 7,
		SORT_ARM64_UP = 8,
		SORT_ARM64_DOWN = 9,
		SORT_386_UP = 10,
		SORT_386_DOWN = 11,
		SORT_PPC64LE_UP = 12,
		SORT_PPC64LE_DOWN = 13,
		SORT_S390X_UP = 14,
		SORT_S390X_DOWN = 15,
		SORT_TYPE_UP = 16,
		SORT_TYPE_DOWN = 17,
		SORT_AUTOMATED_UP = 18,
		SORT_AUTOMATED_DOWN = 19,
		SORT_STARS_UP = 20,
		SORT_STARS_DOWN = 21,
		SORT_PULLS_UP = 22,
		SORT_PULLS_DOWN = 23;

	var sort = SORT_REPOSITORY_UP;

	var search_id = 0;
	var search_total = 0;
	var search_done = 0;

	function search() {
		$("body").addClass("wait");
		
		e_results.innerHTML = "";;
		$(e_results).css({ display: "none", width: "100%" });
		e_results_count.innerHTML = "Results: 0";
		e_progress.innerHTML = "Progress: 0%";
		$(e_progress).attr("style", "");
		search_total = search_done = 0;

		var query = encodeURIComponent(e_query.value);
		var namespace = encodeURIComponent(e_namespace.value);
		
		window.history.replaceState(null, null, window.location.pathname);
		if (query || namespace) {
			var q = "?" + (query ? "q=" + query + "&" : "") + (namespace ? "n=" + namespace + "&" : "") + (e_official.checked ? "o=1&" : "") + (e_automated.checked ? "a=1&" : "");
			if (q.charAt(q.length - 1) === '&') q = q.slice(0, -1);
			window.history.replaceState(null, null, q);
		}

		search_id = Date.now();
		sort = -1;
		hideArrows();
			
		if (isBlank(namespace)) {
			var url = "./search?q=" + query + "&" + (e_official.checked ? "o=1&" : "") + (e_automated.checked ? "a=1&" : "") + "p=";
			$.getJSON(url + "0", function(e) {
				search_total = e.count ? e.count : 0;
				e_results_count.innerHTML = "Results: " + search_total;
				querySearch(search_id, e.results, url, 0);
			}).fail(finishSearch);
		} else {
			var url = "./search?s=1000&n=" + namespace + (query ? "&q=" + query : "") + "&" + (e_official.checked ? "o=1&" : "") + (e_automated.checked ? "a=1&" : "") + "p=";
			$.getJSON(url + "0", function(e) {
				search_total = e.count ? e.count : 0;
				e_results_count.innerHTML = "Results: " + search_total;
				querySearch(search_id, e.results, url, 0);
			}).fail(finishSearch);
		}
	}

	function querySearch(id, results, url, page) {
		if (!results || results.length === 0) {
			finishSearch();
			return;
		}
		
		$(e_progress).attr("style", "");

		for (var i = 0; i < results.length && id === search_id && search_done < search_total; ++i, ++search_done) {
			var row = e_results.insertRow(-1);
			$(row).attr("id", results[i].namespace + "/" + results[i].name);
			row.insertCell(0).innerHTML = "<a href=\"" + window.location.href.replace(window.location.search, "") + "?n=" + results[i].namespace + "\">" + results[i].namespace + "</a>";
			row.insertCell(1).innerHTML = "<a href=\"https://hub.docker.com/" + (results[i].is_official ? "_/" : "r/" + (results[i].namespace ? results[i].namespace + "/" : "")) + results[i].name + "\">" + results[i].name + "</a>";
			addCellHover(row.cells[1], false)
			
			row.insertCell(2).innerHTML = "-";
			row.insertCell(3).innerHTML = "-";
			row.insertCell(4).innerHTML = "-";
			row.insertCell(5).innerHTML = "-";
			row.insertCell(6).innerHTML = "-";
			row.insertCell(7).innerHTML = "-";

			row.insertCell(8).innerHTML = results[i].is_official ? "official" : !results[i].is_private ? "public" : "private";
			row.insertCell(9).innerHTML = results[i].is_automated ? "yes" : "no";
			row.insertCell(10).innerHTML = results[i].star_count.toString();
			row.insertCell(11).innerHTML = results[i].pull_count.toString();
			row.insertCell(12).innerHTML = results[i].description;
			$(row.cells[12]).css({ "text-overflow": "ellipsis" });
			addCellHover(row.cells[12], true);
		}

		if (search_done !== 0 && search_total !== 0) e_progress.innerHTML = "Progress: " + Math.round((search_done / search_total) * 100) + "%";

		if (id === search_id && search_done < search_total) {
			$.getJSON(url + (++page), function(e) {
				querySearch(id, e.results, url, page);
			}).fail(finishSearch);
		} else if (search_done === search_total) {
			finishSearch();
		}
	}

	function sortResults() {
		if (sort === SORT_NONE) return;

		var rows = [];
		for (var i = e_results.rows.length - 1; i > -1; --i) {
			rows.push(e_results.rows[i]);
		}

		switch (sort) {
			case SORT_NAMESPACE_UP:
				rows.sort(function(a, b) {
					var r = a.cells[0].innerText.localeCompare(b.cells[0].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_NAMESPACE_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[0].innerText.localeCompare(b.cells[0].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_REPOSITORY_UP:
				rows.sort(function(a, b) {
					var r = a.cells[1].innerText.localeCompare(b.cells[1].innerText);
					if (r !== 0) return r;
					
					return a.cells[0].innerText.localeCompare(b.cells[0].innerText);
				});
				break;
			case SORT_REPOSITORY_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[1].innerText.localeCompare(b.cells[1].innerText);
					if (r !== 0) return r;
					
					return a.cells[0].innerText.localeCompare(b.cells[0].innerText);
				});
				break;
			case SORT_AMD64_UP:
				rows.sort(function(a, b) {
					var r = a.cells[2].innerText.localeCompare(b.cells[2].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_AMD64_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[2].innerText.localeCompare(b.cells[2].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_ARM_UP:
				rows.sort(function(a, b) {
					var r = a.cells[3].innerText.localeCompare(b.cells[3].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_ARM_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[3].innerText.localeCompare(b.cells[3].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_ARM64_UP:
				rows.sort(function(a, b) {
					var r = a.cells[4].innerText.localeCompare(b.cells[4].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_ARM64_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[4].innerText.localeCompare(b.cells[4].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_386_UP:
				rows.sort(function(a, b) {
					var r = a.cells[5].innerText.localeCompare(b.cells[5].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_386_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[5].innerText.localeCompare(b.cells[5].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_PPC64LE_UP:
				rows.sort(function(a, b) {
					var r = a.cells[6].innerText.localeCompare(b.cells[6].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_PPC64LE_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[6].innerText.localeCompare(b.cells[6].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_S390X_UP:
				rows.sort(function(a, b) {
					var r = a.cells[7].innerText.localeCompare(b.cells[7].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_S390X_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[7].innerText.localeCompare(b.cells[7].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_TYPE_UP:
				rows.sort(function(a, b) {
					var r = a.cells[8].innerText.localeCompare(b.cells[8].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_TYPE_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[8].innerText.localeCompare(b.cells[8].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_AUTOMATED_UP:
				rows.sort(function(a, b) {
					var r = a.cells[9].innerText.localeCompare(b.cells[9].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_AUTOMATED_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[9].innerText.localeCompare(b.cells[9].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_STARS_UP:
				rows.sort(function(a, b) {
					var r = -(parseInt(b.cells[10].innerText) - parseInt(a.cells[10].innerText));
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_STARS_DOWN:
				rows.sort(function(a, b) {
					var r = parseInt(b.cells[10].innerText) - parseInt(a.cells[10].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_PULLS_UP:
				rows.sort(function(a, b) {
					var r = -(parseInt(b.cells[11].innerText) - parseInt(a.cells[11].innerText));
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_PULLS_DOWN:
				rows.sort(function(a, b) {
					var r = parseInt(b.cells[11].innerText) - parseInt(a.cells[11].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
		}

		e_results.tBodies.length = 0;
		e_results.appendChild(document.createElement("tbody"));
		for (var i = 0; i < rows.length; ++i) {
			e_results.tBodies[0].appendChild(rows[i]);
		}
	}
	
	function addArchInfo(id, img, info) {
		if (id === search_id) {
			var e = document.getElementById(img);
			if (e) {
				if (info.arch && info.arch.length > 0) {
					e.cells[2].innerHTML = info.arch.indexOf("amd64") !== -1 ? "<div style=\"color: green;\">✓</div>" : "<div style=\"color: red;\">✕</div>";
					e.cells[3].innerHTML = info.arch.indexOf("arm") !== -1 ? "<div style=\"color: green;\">✓</div>" : "<div style=\"color: red;\">✕</div>";
					e.cells[4].innerHTML = info.arch.indexOf("arm64") !== -1 ? "<div style=\"color: green;\">✓</div>" : "<div style=\"color: red;\">✕</div>";
					e.cells[5].innerHTML = info.arch.indexOf("386") !== -1 ? "<div style=\"color: green;\">✓</div>" : "<div style=\"color: red;\">✕</div>";
					e.cells[6].innerHTML = info.arch.indexOf("ppc64le") !== -1 ? "<div style=\"color: green;\">✓</div>" : "<div style=\"color: red;\">✕</div>";
					e.cells[7].innerHTML = info.arch.indexOf("s390x") !== -1 ? "<div style=\"color: green;\">✓</div>" : "<div style=\"color: red;\">✕</div>";
				} else {
					for (var i = 0; i < 6; ++i) e.cells[2 + i].innerHTML = "<div style=\"color: red;\">✕</div>";
				}
				
				/* if (info.os) {
					
				} */
			}
		}
	}
	
	function finishSearch() {
		e_progress.innerHTML = "Progress: 100%";
		$(e_progress).fadeOut("slow");
		$(e_results).attr("style", "");
		$(e_results).css("width", "100%");
		$("body").removeClass("wait");
		
		var id = search_id;
		var imgs = "";
		for (var i = 0; i < e_results.rows.length && id === search_id; ++i) {
			imgs += e_results.rows[i].cells[0].innerText + "%2F" + e_results.rows[i].cells[1].innerText;
			if ((i > 0 && (i + 1) % 25 === 0) || i + 1 === e_results.rows.length) {
				$.getJSON("./arch?i=" + imgs, function(e) {
					if (id === search_id) {
						for (var r in e) {
							if (id !== search_id) break;
							addArchInfo(id, r, e[r]);
						}
						
						if (id === search_id) {
							sortResults();
						}
					}
				});
				
				imgs = "";
			} else {
				imgs += ",";
			}
		}
	}

	function addCellHover(cell, click) {
		$(cell).mouseover(function(e) {
			if (this.offsetWidth < this.scrollWidth) {
				var p = this.getBoundingClientRect().top;
				e_description.innerText = this.innerText;
				$(e_description).attr("style", "");
				$(e_description).css({
					"box-shadow": "0px 0px 10px #000000",
					padding: "5px 5px 5px 5px",
					top: p - e_description.offsetHeight - 10,
					right: $(window).width() - this.getBoundingClientRect().right
				});
			}
		});
			
		if (click) {
			$(cell).mousedown(function() {
				if (this.offsetWidth < this.scrollWidth) {
					var cell = this;
					$(cell).unbind("mouseleave");
					
					e_description.onmouseleave = function() {
						$(cell).mouseleave(function(e) {
							$(e_description).attr("style", "");
							$(e_description).css("display", "none");
						});
		
						$(e_description).attr("style", "");
						$(e_description).css("display", "none");
						$(e_description).unbind("mouseleave");
					};
					
					$(e_description).css({
						"box-shadow": "0px 0px 10px #000000",
						padding: "5px 5px 5px 5px",
						top: this.getBoundingClientRect().top - this.offsetHeight + 15,
						right: $(window).width() - this.getBoundingClientRect().right
					});
				}
			});
		}
			
		$(cell).mouseleave(function(e) {
			$(e_description).attr("style", "");
			$(e_description).css("display", "none");
		});
	}
	
	function isBlank(s) {
		return s.length === 0 || !s.trim();
	}
	
	function inputSearch(e) {
		if (e.keyCode === 13) {
			search();
		}
	}

	$(e_query).keypress(inputSearch);
	$(e_namespace).keypress(inputSearch);

	$(e_search).click(search);
	
	function ready() {
		$("#github").css("display", "");
		$("#table_holder").css({ "margin-top": $("#options").outerHeight() + 10, display: "" });
		$("#results_holder").css({ "overflow-y": "scroll", height: $(window).height() - ($("#headers").offset().top + $("#headers").outerHeight() + 40) });
		$("#table_holder_margin").css({ "padding-right": getScrollBarWidth() });
	}

	$("#namespace_up").click(function() { sort = SORT_NAMESPACE_UP; sortResults(); });
	$("#namespace_down").click(function() { sort = SORT_NAMESPACE_DOWN; sortResults(); });
	$("#repository_up").click(function() { sort = SORT_REPOSITORY_UP; sortResults(); });
	$("#repository_down").click(function() { sort = SORT_REPOSITORY_DOWN; sortResults(); });
	$("#type_up").click(function() { sort = SORT_TYPE_UP; sortResults(); });
	$("#type_down").click(function() { sort = SORT_TYPE_DOWN; sortResults(); });
	$("#automated_up").click(function() { sort = SORT_AUTOMATED_UP; sortResults(); });
	$("#automated_down").click(function() { sort = SORT_AUTOMATED_DOWN; sortResults(); });
	$("#stars_up").click(function() { sort = SORT_STARS_UP; sortResults(); });
	$("#stars_down").click(function() { sort = SORT_STARS_DOWN; sortResults(); });
	$("#pulls_up").click(function() { sort = SORT_PULLS_UP; sortResults(); });
	$("#pulls_down").click(function() { sort = SORT_PULLS_DOWN; sortResults(); });
	
	function getScrollBarWidth () {
		var o = $("<div>").css({ visibility: "hidden", width: 100, overflow: "scroll" }).appendTo("body");
        var s = $("<div>").css({ width: "100%" }).appendTo(o).outerWidth();
		o.remove();
		return 100 - s;
	};
	
	function hideArrows() {
		$(".arrow-up, .arrow-down").each(function(i, e) {
			$(e).css("visibility", "hidden");
		});
	}
	
	$("#label_namespace").mousedown(function() {
		hideArrows();
		$("#namespace_down, #namespace_up").attr("style", "");
		
		if (sort == SORT_NAMESPACE_UP) {
			$("#namespace_down").css("visibility", "visible");
			$("#namespace_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_NAMESPACE_DOWN;
		} else {
			$("#namespace_down").css("visibility", "hidden");
			$("#namespace_up").css("visibility", "visible");
			sort = SORT_NAMESPACE_UP;
		}
		
		sortResults();
	});
	
	$("#label_repository").mousedown(function() {
		hideArrows();
		$("#repository_down, #repository_up").attr("style", "");
		
		if (sort == SORT_REPOSITORY_UP) {
			$("#repository_down").css("visibility", "visible");
			$("#repository_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_REPOSITORY_DOWN;
		} else {
			$("#repository_down").css("visibility", "hidden");
			$("#repository_up").css("visibility", "visible");
			sort = SORT_REPOSITORY_UP;
		}
		
		sortResults();
	});
	
	$("#label_amd64").mousedown(function() {
		hideArrows();
		$("#amd64_down, #amd64_up").attr("style", "");
		
		if (sort == SORT_AMD64_UP) {
			$("#amd64_down").css("visibility", "visible");
			$("#amd64_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_AMD64_DOWN;
		} else {
			$("#amd64_down").css("visibility", "hidden");
			$("#amd64_up").css("visibility", "visible");
			sort = SORT_AMD64_UP;
		}
		
		sortResults();
	});
	
	$("#label_arm").mousedown(function() {
		hideArrows();
		$("#arm_down, #arm_up").attr("style", "");
		
		if (sort == SORT_ARM_UP) {
			$("#arm_down").css("visibility", "visible");
			$("#arm_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_ARM_DOWN;
		} else {
			$("#arm_down").css("visibility", "hidden");
			$("#arm_up").css("visibility", "visible");
			sort = SORT_ARM_UP;
		}
		
		sortResults();
	});
	
	$("#label_arm64").mousedown(function() {
		hideArrows();
		$("#arm64_down, #arm64_up").attr("style", "");
		
		if (sort == SORT_ARM64_UP) {
			$("#arm64_down").css("visibility", "visible");
			$("#arm64_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_ARM64_DOWN;
		} else {
			$("#arm64_down").css("visibility", "hidden");
			$("#arm64_up").css("visibility", "visible");
			sort = SORT_ARM64_UP;
		}
		
		sortResults();
	});
	
	$("#label_386").mousedown(function() {
		hideArrows();
		$("#386_down, #386_up").attr("style", "");
		
		if (sort == SORT_386_UP) {
			$("#386_down").css("visibility", "visible");
			$("#386_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_386_DOWN;
		} else {
			$("#386_down").css("visibility", "hidden");
			$("#386_up").css("visibility", "visible");
			sort = SORT_386_UP;
		}
		
		sortResults();
	});
	
	$("#label_ppc64le").mousedown(function() {
		hideArrows();
		$("#ppc64le_down, #ppc64le_up").attr("style", "");
		
		if (sort == SORT_PPC64LE_UP) {
			$("#ppc64le_down").css("visibility", "visible");
			$("#ppc64le_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_PPC64LE_DOWN;
		} else {
			$("#ppc64le_down").css("visibility", "hidden");
			$("#ppc64le_up").css("visibility", "visible");
			sort = SORT_PPC64LE_UP;
		}
		
		sortResults();
	});
	
	$("#label_s390x").mousedown(function() {
		hideArrows();
		$("#s390x_down, #s390x_up").attr("style", "");
		
		if (sort == SORT_S390X_UP) {
			$("#s390x_down").css("visibility", "visible");
			$("#s390x_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_S390X_DOWN;
		} else {
			$("#s390x_down").css("visibility", "hidden");
			$("#s390x_up").css("visibility", "visible");
			sort = SORT_S390X_UP;
		}
		
		sortResults();
	});
	
	$("#label_type").mousedown(function() {
		hideArrows();
		$("#type_down, #type_up").attr("style", "");
		
		if (sort == SORT_TYPE_UP) {
			$("#type_down").css("visibility", "visible");
			$("#type_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_TYPE_DOWN;
		} else {
			$("#type_down").css("visibility", "hidden");
			$("#type_up").css("visibility", "visible");
			sort = SORT_TYPE_UP;
		}
		
		sortResults();
	});
	
	$("#label_automated").mousedown(function() {
		hideArrows();
		$("#automated_down, #automated_up").attr("style", "");
		
		if (sort == SORT_AUTOMATED_UP) {
			$("#automated_down").css("visibility", "visible");
			$("#automated_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_AUTOMATED_DOWN;
		} else {
			$("#automated_down").css("visibility", "hidden");
			$("#automated_up").css("visibility", "visible");
			sort = SORT_AUTOMATED_UP;
		}
		
		sortResults();
	});
	
	$("#label_stars").mousedown(function() {
		hideArrows();
		$("#stars_down, #stars_up").attr("style", "");
		
		if (sort == SORT_STARS_UP) {
			$("#stars_down").css("visibility", "visible");
			$("#stars_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_STARS_DOWN;
		} else {
			$("#stars_down").css("visibility", "hidden");
			$("#stars_up").css("visibility", "visible");
			sort = SORT_STARS_UP;
		}
		
		sortResults();
	});
	
	$("#label_pulls").mousedown(function() {
		hideArrows();
		$("#pulls_down, #pulls_up").attr("style", "");
		
		if (sort == SORT_PULLS_UP) {
			$("#pulls_down").css("visibility", "visible");
			$("#pulls_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_PULLS_DOWN;
		} else {
			$("#pulls_down").css("visibility", "hidden");
			$("#pulls_up").css("visibility", "visible");
			sort = SORT_PULLS_UP;
		}
		
		sortResults();
	});
	
	$(e_official).click(function() {
		if (e_official.checked) {
			e_namespace.value = "library";
			e_namespace.disabled = true;
		} else {
			e_namespace.value = "";
			e_namespace.disabled = false;
		}
	});
	
	if (!isBlank(window.location.search)) {
		var s = decodeURIComponent(window.location.search.slice(1));
		if (!isBlank(s)) {
			var i = s.indexOf("n=");
			if (i !== -1) {
				var e = s.indexOf("&", i);
				e_namespace.value = s.substring(i + 2, e === -1 ? s.length : e);
			}
			
			i = s.indexOf("q=");
			if (i !== -1) {
				var e = s.indexOf("&", i);
				e_query.value = s.substring(i + 2, e === -1 ? s.length : e);
			}
			
			i = s.indexOf("a=");
			if (i !== -1) {
				var e = s.indexOf("&", i);
				if (s.substring(i + 2, e === -1 ? s.length : e) === "1") {
					e_automated.checked = true;
				}
			}
			
			i = s.indexOf("o=");
			if (i !== -1) {
				var e = s.indexOf("&", i);
				if (s.substring(i + 2, e === -1 ? s.length : e) === "1") {
					e_official.checked = true;
					e_namespace.disabled = true;
				}
			}
			
			search();
		}
	}
})(document);